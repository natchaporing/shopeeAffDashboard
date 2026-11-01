import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import {productVideoSchema} from '../remotion/schema';
import {TEMPLATES} from '../remotion/templates/registry';
import {deleteOldFiles, rateLimit} from './guards';
import {JobQueue, QueueFullError} from './jobs';
import {ROOT, getServeUrl, renderFrame, renderVideo} from './render';
import {validateJobRequest} from './validate';

const PORT = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === 'production';

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const OUTPUT_DIR = path.join(DATA_DIR, 'outputs');
fs.mkdirSync(UPLOAD_DIR, {recursive: true});
fs.mkdirSync(OUTPUT_DIR, {recursive: true});

// No login yet, so keep the open server from being abused or filling the disk.
const RETENTION_DAYS = Number(process.env.RETENTION_DAYS || 7);
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;
const MAX_QUEUED = Number(process.env.MAX_QUEUED || 5);

// Upload rules. Images are resized in the browser before upload, so 15 MB is generous.
const ALLOWED: Record<string, {ext: string; kind: 'image' | 'audio'}> = {
	'image/jpeg': {ext: 'jpg', kind: 'image'},
	'image/png': {ext: 'png', kind: 'image'},
	'image/webp': {ext: 'webp', kind: 'image'},
	'audio/mpeg': {ext: 'mp3', kind: 'audio'},
	'audio/mp4': {ext: 'm4a', kind: 'audio'},
	'audio/x-m4a': {ext: 'm4a', kind: 'audio'},
	'audio/wav': {ext: 'wav', kind: 'audio'},
	'audio/x-wav': {ext: 'wav', kind: 'audio'},
};

const upload = multer({
	storage: multer.diskStorage({
		destination: UPLOAD_DIR,
		filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}.${ALLOWED[file.mimetype]?.ext ?? 'bin'}`),
	}),
	limits: {fileSize: 15 * 1024 * 1024, files: 1},
	fileFilter: (_req, file, cb) => {
		if (ALLOWED[file.mimetype]) cb(null, true);
		else cb(new Error(`Unsupported file type ${file.mimetype}. Use JPG, PNG or WebP images (iPhone HEIC: export as JPG) and MP3/M4A/WAV audio.`));
	},
});

const queue = new JobQueue({
	dataDir: DATA_DIR,
	outputDir: OUTPUT_DIR,
	render: renderVideo,
	toAbsolute: (src) => `http://127.0.0.1:${PORT}${src}`,
	maxQueued: MAX_QUEUED,
});

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Railway / any single reverse proxy: req.ip = real client
app.use(express.json({limit: '200kb'}));
app.use((_req, res, next) => {
	res.setHeader('X-Robots-Tag', 'noindex, nofollow');
	next();
});

app.get('/robots.txt', (_req, res) => {
	res.type('text/plain').send('User-agent: *\nDisallow: /\n');
});

app.use('/uploads', express.static(UPLOAD_DIR, {immutable: true, maxAge: '7d'}));
app.use('/outputs', express.static(OUTPUT_DIR));

app.get('/api/health', (_req, res) => {
	res.json({ok: true});
});

app.get('/api/templates', (_req, res) => {
	res.json(TEMPLATES.map(({component: _c, durationInFrames: _d, ...manifest}) => manifest));
});

const uploadLimit = rateLimit({windowMs: 15 * 60_000, max: 150, message: 'Too many uploads. Wait a few minutes and try again.'});
const jobLimit = rateLimit({windowMs: 15 * 60_000, max: 20, message: 'Too many videos in a short time. Wait a few minutes and try again.'});

app.post('/api/uploads', uploadLimit, (req, res) => {
	upload.single('file')(req, res, (err: unknown) => {
		if (err) {
			res.status(400).json({error: err instanceof Error ? err.message : String(err)});
			return;
		}
		if (!req.file) {
			res.status(400).json({error: 'No file in field "file"'});
			return;
		}
		res.status(201).json({
			url: `/uploads/${req.file.filename}`,
			kind: ALLOWED[req.file.mimetype].kind,
			bytes: req.file.size,
		});
	});
});

app.post('/api/jobs', jobLimit, (req, res) => {
	const result = validateJobRequest(req.body);
	if (!result.ok) {
		res.status(400).json({errors: result.errors});
		return;
	}
	try {
		const job = queue.enqueue(result.value.templateId, result.value.props);
		res.status(202).json(publicJob(job.id));
	} catch (err) {
		if (err instanceof QueueFullError) res.status(429).json({error: err.message});
		else throw err;
	}
});

app.get('/api/jobs', (_req, res) => {
	res.json(queue.list().slice(0, 30).map((j) => publicJob(j.id)));
});

app.get('/api/jobs/:id', (req, res) => {
	const job = publicJob(req.params.id);
	if (!job) res.status(404).json({error: 'Job not found'});
	else res.json(job);
});

function publicJob(id: string) {
	const job = queue.get(id);
	if (!job) return null;
	return {
		id: job.id,
		templateId: job.templateId,
		status: job.status,
		progress: job.progress,
		queuePosition: job.status === 'queued' ? queue.position(job.id) + 1 : 0,
		createdAt: job.createdAt,
		finishedAt: job.finishedAt,
		videoUrl: job.videoUrl,
		caption: job.caption,
		error: job.error,
		title: job.props.title,
	};
}

if (isProd) {
	const webDist = path.join(ROOT, 'dist/web');
	app.use(express.static(webDist));
	app.get('/{*splat}', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
} else {
	const {createServer} = await import('vite');
	const vite = await createServer({
		configFile: path.join(ROOT, 'vite.config.ts'),
		server: {middlewareMode: true},
		appType: 'spa',
	});
	app.use(vite.middlewares);
}

function sweep() {
	const removed = deleteOldFiles([UPLOAD_DIR, OUTPUT_DIR], RETENTION_MS);
	queue.prune(RETENTION_MS);
	if (removed) console.log(`cleanup: removed ${removed} file(s) older than ${RETENTION_DAYS} days`);
}
sweep();
setInterval(sweep, 60 * 60_000).unref();

/**
 * Render one frame of the sample product at startup. Proves the headless browser and
 * its system libraries work in this container (logged as ok / FAILED) and warms the
 * browser so the first real render starts faster. RENDER_SELFTEST=0 turns it off.
 */
async function renderSelfTest() {
	const started = Date.now();
	const props = productVideoSchema.parse({
		platform: 'shopee',
		title: 'self-test',
		hook: 'ทดสอบ',
		price: 289,
		originalPrice: 590,
		images: [{src: `http://127.0.0.1:${PORT}/samples/product-1.jpg`}],
	});
	const output = path.join(os.tmpdir(), 'video-studio-selftest.png');
	await renderFrame({templateId: TEMPLATES[0].id, props, frame: 0, output});
	const bytes = fs.statSync(output).size;
	fs.rmSync(output, {force: true});
	return {ms: Date.now() - started, bytes};
}

app.listen(PORT, () => {
	console.log(`video-studio listening on http://localhost:${PORT} (${isProd ? 'production' : 'dev'}), data in ${DATA_DIR}`);
	// Warm the Remotion bundle so the first render doesn't wait for it.
	getServeUrl()
		.then(() => {
			console.log('remotion bundle ready');
			if (process.env.RENDER_SELFTEST === '0') return;
			return renderSelfTest().then(
				({ms, bytes}) => console.log(`render self-test ok: frame rendered in ${ms}ms (${bytes} bytes)`),
				(err) => console.error('render self-test FAILED', err),
			);
		})
		.catch((err) => console.error('remotion bundle failed', err));
});
