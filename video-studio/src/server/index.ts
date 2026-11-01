import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express, {type RequestHandler} from 'express';
import multer from 'multer';
import {productVideoSchema} from '../remotion/schema';
import {BUILT_IN_TEMPLATES} from '../shared/templates';
import {deleteOldFiles, rateLimit} from './guards';
import {JobQueue, QueueFullError} from './jobs';
import {probeVideo, type VideoInfo} from './media';
import {ROOT, getServeUrl, renderFrame, renderVideo} from './render';
import {TemplateError, TemplateStore} from './templates-store';
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
/** When set, creating / editing / deleting templates needs header x-admin-key. */
const ADMIN_KEY = process.env.ADMIN_KEY || '';
/** "manual" = copy the prompt, make the clip in your AI tool, upload it. API providers plug in later. */
const AI_PROVIDER = process.env.AI_VIDEO_PROVIDER || 'manual';

const MB = 1024 * 1024;
const ALLOWED: Record<string, {ext: string; kind: 'image' | 'audio' | 'video'; maxBytes: number}> = {
	'image/jpeg': {ext: 'jpg', kind: 'image', maxBytes: 15 * MB},
	'image/png': {ext: 'png', kind: 'image', maxBytes: 15 * MB},
	'image/webp': {ext: 'webp', kind: 'image', maxBytes: 15 * MB},
	'audio/mpeg': {ext: 'mp3', kind: 'audio', maxBytes: 15 * MB},
	'audio/mp4': {ext: 'm4a', kind: 'audio', maxBytes: 15 * MB},
	'audio/x-m4a': {ext: 'm4a', kind: 'audio', maxBytes: 15 * MB},
	'audio/wav': {ext: 'wav', kind: 'audio', maxBytes: 15 * MB},
	'audio/x-wav': {ext: 'wav', kind: 'audio', maxBytes: 15 * MB},
	'video/mp4': {ext: 'mp4', kind: 'video', maxBytes: 150 * MB},
	'video/quicktime': {ext: 'mov', kind: 'video', maxBytes: 150 * MB},
	'video/webm': {ext: 'webm', kind: 'video', maxBytes: 150 * MB},
};

const upload = multer({
	storage: multer.diskStorage({
		destination: UPLOAD_DIR,
		filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}.${ALLOWED[file.mimetype]?.ext ?? 'bin'}`),
	}),
	limits: {fileSize: 150 * MB, files: 1},
	fileFilter: (_req, file, cb) => {
		if (ALLOWED[file.mimetype]) cb(null, true);
		else
			cb(
				new Error(
					`Unsupported file type ${file.mimetype || 'unknown'}. Use JPG/PNG/WebP photos (iPhone HEIC: export as JPG), MP3/M4A/WAV music, MP4/MOV/WebM clips.`,
				),
			);
	},
});

/** Measured video info, stored next to the upload as `<file>.json`. */
function clipInfo(src: string): VideoInfo | undefined {
	const name = path.basename(src);
	try {
		return JSON.parse(fs.readFileSync(path.join(UPLOAD_DIR, `${name}.json`), 'utf8')) as VideoInfo;
	} catch {
		return undefined;
	}
}

const templates = new TemplateStore(DATA_DIR);

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
app.use((req, res, next) => {
	res.setHeader('X-Robots-Tag', 'noindex, nofollow');
	// The renderer's page runs on its own port and @remotion/media fetches clips, so
	// media files must allow cross-origin reads.
	if (/^\/(uploads|outputs|samples|fonts)\//.test(req.path)) res.setHeader('Access-Control-Allow-Origin', '*');
	next();
});

app.get('/robots.txt', (_req, res) => {
	res.type('text/plain').send('User-agent: *\nDisallow: /\n');
});

app.use('/uploads', express.static(UPLOAD_DIR, {immutable: true, maxAge: '7d', index: false}));
app.use('/outputs', express.static(OUTPUT_DIR));

app.get('/api/health', (_req, res) => {
	res.json({ok: true});
});

app.get('/api/config', (_req, res) => {
	res.json({adminKeyRequired: Boolean(ADMIN_KEY), aiProvider: AI_PROVIDER});
});

/* ---------------------------------------------------------------- templates */

const templateWriteLimit = rateLimit({windowMs: 15 * 60_000, max: 60, message: 'Too many template changes. Wait a few minutes.'});

const requireAdmin: RequestHandler = (req, res, next) => {
	if (!ADMIN_KEY) return next();
	const given = req.get('x-admin-key') ?? '';
	const ok = given.length === ADMIN_KEY.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(ADMIN_KEY));
	if (ok) next();
	else res.status(401).json({error: 'Admin key required to change templates.'});
};

function sendTemplateError(res: express.Response, err: unknown) {
	if (err instanceof TemplateError) res.status(err.status).json({error: err.message, errors: err.problems});
	else throw err;
}

app.get('/api/templates', (_req, res) => {
	res.json(templates.list());
});

app.post('/api/templates', templateWriteLimit, requireAdmin, (req, res) => {
	try {
		res.status(201).json(templates.create(req.body));
	} catch (err) {
		sendTemplateError(res, err);
	}
});

app.put('/api/templates/:id', templateWriteLimit, requireAdmin, (req, res) => {
	try {
		res.json(templates.update(String(req.params.id), req.body));
	} catch (err) {
		sendTemplateError(res, err);
	}
});

app.delete('/api/templates/:id', templateWriteLimit, requireAdmin, (req, res) => {
	try {
		templates.delete(String(req.params.id));
		res.status(204).end();
	} catch (err) {
		sendTemplateError(res, err);
	}
});

/* ------------------------------------------------------------------ uploads */

const uploadLimit = rateLimit({windowMs: 15 * 60_000, max: 150, message: 'Too many uploads. Wait a few minutes and try again.'});
const jobLimit = rateLimit({windowMs: 15 * 60_000, max: 20, message: 'Too many videos in a short time. Wait a few minutes and try again.'});

app.post('/api/uploads', uploadLimit, (req, res) => {
	upload.single('file')(req, res, async (err: unknown) => {
		if (err) {
			res.status(400).json({error: err instanceof Error ? err.message : String(err)});
			return;
		}
		if (!req.file) {
			res.status(400).json({error: 'No file in field "file"'});
			return;
		}
		const rule = ALLOWED[req.file.mimetype];
		const reject = (msg: string) => {
			fs.rmSync(req.file!.path, {force: true});
			res.status(400).json({error: msg});
		};
		if (req.file.size > rule.maxBytes) return reject(`File too large: max ${rule.maxBytes / MB} MB for ${rule.kind}.`);

		let video: VideoInfo | undefined;
		if (rule.kind === 'video') {
			try {
				video = await probeVideo(req.file.path);
			} catch {
				return reject('Could not read this video. Export it as MP4 (H.264) and try again.');
			}
			fs.writeFileSync(`${req.file.path}.json`, JSON.stringify(video));
		}

		res.status(201).json({
			url: `/uploads/${req.file.filename}`,
			kind: rule.kind,
			bytes: req.file.size,
			...(video ?? {}),
		});
	});
});

/* --------------------------------------------------------------------- jobs */

app.post('/api/jobs', jobLimit, (req, res) => {
	const result = validateJobRequest(req.body, {getTemplate: (id) => templates.get(id), clipInfo});
	if (!result.ok) {
		res.status(400).json({errors: result.errors});
		return;
	}
	try {
		const {templateId, compositionId, props} = result.value;
		const job = queue.enqueue(templateId, compositionId, props);
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
		templateName: templates.get(job.templateId)?.name ?? job.templateId,
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

/* -------------------------------------------------------------- web app */

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
	// sidecar .json files age together with their video
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
		style: BUILT_IN_TEMPLATES[0].style,
	});
	const output = path.join(os.tmpdir(), 'video-studio-selftest.png');
	await renderFrame({compositionId: 'slideshow', props, frame: 0, output});
	const bytes = fs.statSync(output).size;
	fs.rmSync(output, {force: true});
	return {ms: Date.now() - started, bytes};
}

app.listen(PORT, () => {
	console.log(
		`video-studio listening on http://localhost:${PORT} (${isProd ? 'production' : 'dev'}), data in ${DATA_DIR}, ` +
			`${templates.list().length} templates, AI provider: ${AI_PROVIDER}${ADMIN_KEY ? ', admin key on' : ''}`,
	);
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
