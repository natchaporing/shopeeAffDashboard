import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';
import {productVideoSchema} from '../src/remotion/schema';
import {deleteOldFiles, rateLimit} from '../src/server/guards';
import {JobQueue, QueueFullError, type RenderFn} from '../src/server/jobs';
import {EMPTY_FORM, parseNumber, reviveForm, toInput} from '../src/web/form';
import {BUILT_IN_TEMPLATES} from '../src/shared/templates';

const props = productVideoSchema.parse({
	platform: 'shopee',
	title: 'สินค้า',
	price: 100,
	images: [{src: '/uploads/a.jpg'}],
});

function tmpDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'vs-test-'));
}

const until = async (cond: () => boolean) => {
	for (let i = 0; i < 200 && !cond(); i++) await new Promise((r) => setTimeout(r, 5));
	assert.ok(cond(), 'condition not reached');
};

describe('job queue', () => {
	it('renders with absolute asset URLs, saves metadata and reloads it', async () => {
		const dataDir = tmpDir();
		const seen: string[] = [];
		const render: RenderFn = async ({props: p, outputLocation, onProgress}) => {
			seen.push(p.images[0].src);
			onProgress(0.5);
			fs.writeFileSync(outputLocation, 'mp4');
		};
		const q = new JobQueue({dataDir, outputDir: dataDir, render, toAbsolute: (s) => `http://x${s}`, maxQueued: 5});
		const job = q.enqueue('multi-angle-slideshow', 'slideshow', props);
		await until(() => q.get(job.id)?.status === 'done');
		assert.deepEqual(seen, ['http://x/uploads/a.jpg']);
		assert.equal(q.get(job.id)?.videoUrl, `/outputs/${job.id}.mp4`);
		assert.equal(q.get(job.id)?.props.images[0].src, '/uploads/a.jpg', 'stored props keep relative paths');

		const reloaded = new JobQueue({dataDir, outputDir: dataDir, render, toAbsolute: (s) => s, maxQueued: 5});
		assert.equal(reloaded.get(job.id)?.status, 'done');
	});

	it('marks jobs interrupted by a restart as failed', () => {
		const dataDir = tmpDir();
		fs.mkdirSync(path.join(dataDir, 'jobs'));
		const stuck = {id: 'j1', templateId: 't', props, status: 'rendering', progress: 0.3, createdAt: new Date().toISOString(), caption: ''};
		fs.writeFileSync(path.join(dataDir, 'jobs', 'j1.json'), JSON.stringify(stuck));
		const q = new JobQueue({dataDir, outputDir: dataDir, render: async () => undefined, toAbsolute: (s) => s, maxQueued: 5});
		assert.equal(q.get('j1')?.status, 'failed');
		assert.match(q.get('j1')?.error ?? '', /restart/);
	});

	it('records render errors and refuses work when the queue is full', async () => {
		const dataDir = tmpDir();
		let release!: () => void;
		const gate = new Promise<void>((r) => (release = r));
		const render: RenderFn = async () => {
			await gate;
			throw new Error('boom');
		};
		const q = new JobQueue({dataDir, outputDir: dataDir, render, toAbsolute: (s) => s, maxQueued: 1});
		const first = q.enqueue('t', 'slideshow', props); // starts rendering right away
		await until(() => q.get(first.id)?.status === 'rendering');
		q.enqueue('t', 'slideshow', props); // waits in the queue
		assert.throws(() => q.enqueue('t', 'slideshow', props), QueueFullError);
		release();
		await until(() => q.get(first.id)?.status === 'failed');
		assert.equal(q.get(first.id)?.error, 'boom');
	});
});

describe('guards', () => {
	it('deletes only files older than the limit', () => {
		const dir = tmpDir();
		const oldFile = path.join(dir, 'old.jpg');
		const newFile = path.join(dir, 'new.jpg');
		fs.writeFileSync(oldFile, 'x');
		fs.writeFileSync(newFile, 'x');
		const tenDaysAgo = (Date.now() - 10 * 86_400_000) / 1000;
		fs.utimesSync(oldFile, tenDaysAgo, tenDaysAgo);
		assert.equal(deleteOldFiles([dir, path.join(dir, 'missing')], 7 * 86_400_000), 1);
		assert.ok(!fs.existsSync(oldFile));
		assert.ok(fs.existsSync(newFile));
	});

	it('rate limits per IP', () => {
		const limiter = rateLimit({windowMs: 60_000, max: 2, message: 'slow down'});
		const statuses: number[] = [];
		const call = (ip: string) => {
			let status = 200;
			const res = {
				setHeader: () => undefined,
				status(code: number) {
					status = code;
					return this;
				},
				json: () => undefined,
			};
			limiter({ip} as never, res as never, () => undefined);
			statuses.push(status);
		};
		call('1.1.1.1');
		call('1.1.1.1');
		call('1.1.1.1');
		call('2.2.2.2');
		assert.deepEqual(statuses, [200, 200, 429, 200]);
	});
});

describe('web form', () => {
	it('parses Thai-style numbers', () => {
		assert.equal(parseNumber('1,290'), 1290);
		assert.equal(parseNumber('฿ 99.50'), 99.5);
		assert.equal(parseNumber(''), undefined);
		assert.ok(Number.isNaN(parseNumber('abc')));
	});

	it('revives drafts defensively', () => {
		assert.deepEqual(reviveForm(null), EMPTY_FORM);
		const revived = reviveForm({platform: 'lazada', title: 'x', images: [{id: 'a', src: '/uploads/a.jpg'}, {bad: true}], templateId: 'gone'});
		assert.equal(revived.platform, 'lazada');
		assert.equal(revived.images.length, 1);
		assert.equal(revived.templateId, 'gone', 'kept: custom templates load from the server after the draft');
		assert.equal(reviveForm({templateId: 42}).templateId, EMPTY_FORM.templateId);
		assert.equal(revived.cta, EMPTY_FORM.cta);
	});

	it('builds valid props from a filled form, with the template style', () => {
		const flash = BUILT_IN_TEMPLATES.find((t) => t.id === 'flash-sale')!;
		const input = toInput({...EMPTY_FORM, title: 'สินค้า', price: '1,290', sold: '12.7', images: [{id: 'a', src: '/uploads/a.jpg', width: 1, height: 1, name: 'a'}]}, flash);
		const parsed = productVideoSchema.safeParse(input);
		assert.ok(parsed.success);
		assert.equal(input.price, 1290);
		assert.equal(input.sold, 13);
		assert.equal(parsed.success && parsed.data.style.ribbon, 'FLASH SALE');
	});

	it('only sends the clip to clip templates', () => {
		const clip = {src: '/uploads/c.mp4', name: 'c.mp4', durationInSeconds: 5, keepAudio: true};
		const form = {...EMPTY_FORM, clip};
		const own = BUILT_IN_TEMPLATES.find((t) => t.id === 'own-clip')!;
		const classic = BUILT_IN_TEMPLATES[0];
		assert.equal(toInput(form, own).clip?.src, '/uploads/c.mp4');
		assert.equal(toInput(form, classic).clip, undefined);
		assert.equal(reviveForm({clip: {src: 'x'}}).clip, undefined, 'clip without duration is dropped');
	});
});
