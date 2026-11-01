import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import {TEMPLATES} from '../remotion/templates/registry';
import {JobQueue} from './jobs';
import {ROOT, getServeUrl} from './render';
import {validateJobRequest} from './validate';

const PORT = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === 'production';

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const OUTPUT_DIR = path.join(DATA_DIR, 'outputs');
fs.mkdirSync(UPLOAD_DIR, {recursive: true});
fs.mkdirSync(OUTPUT_DIR, {recursive: true});

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

const queue = new JobQueue(OUTPUT_DIR, (src) => `http://127.0.0.1:${PORT}${src}`);

const app = express();
app.disable('x-powered-by');
app.use(express.json({limit: '200kb'}));

app.use('/uploads', express.static(UPLOAD_DIR, {immutable: true, maxAge: '7d'}));
app.use('/outputs', express.static(OUTPUT_DIR));

app.get('/api/health', (_req, res) => {
	res.json({ok: true});
});

app.get('/api/templates', (_req, res) => {
	res.json(
		TEMPLATES.map(({component: _c, durationInFrames: _d, ...manifest}) => manifest),
	);
});

app.post('/api/uploads', (req, res) => {
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

app.post('/api/jobs', (req, res) => {
	const result = validateJobRequest(req.body);
	if (!result.ok) {
		res.status(400).json({errors: result.errors});
		return;
	}
	const job = queue.enqueue(result.value.templateId, result.value.props);
	res.status(202).json(publicJob(job.id));
});

app.get('/api/jobs', (_req, res) => {
	res.json(queue.list().slice(0, 50).map((j) => publicJob(j.id)));
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

app.listen(PORT, () => {
	console.log(`video-studio listening on http://localhost:${PORT} (${isProd ? 'production' : 'dev'})`);
	// Warm the Remotion bundle so the first render doesn't wait for it.
	getServeUrl()
		.then(() => console.log('remotion bundle ready'))
		.catch((err) => console.error('remotion bundle failed', err));
});
