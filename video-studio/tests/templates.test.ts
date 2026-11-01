import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';
import {ENGINES} from '../src/remotion/engines';
import {productVideoSchema} from '../src/remotion/schema';
import {DEFAULT_STYLE, PACE, luminance, readableOn, resolveTheme, styleSchema} from '../src/remotion/style';
import {clipFrames} from '../src/remotion/templates/ClipOverlay';
import {TemplateError, TemplateStore, slugify} from '../src/server/templates-store';
import {BUILT_IN_TEMPLATES, fillPrompt, promptPlaceholders, templateProblems, templateSchema} from '../src/shared/templates';

describe('built-in templates', () => {
	it('are valid, unique and usable', () => {
		const ids = BUILT_IN_TEMPLATES.map((t) => t.id);
		assert.equal(new Set(ids).size, ids.length);
		for (const t of BUILT_IN_TEMPLATES) {
			assert.deepEqual(templateProblems(t), [], t.id);
			assert.ok(ENGINES[t.engine], t.id);
			assert.ok(t.builtIn);
		}
		assert.ok(ids.includes('multi-angle-slideshow'), 'old jobs keep their template id');
	});
});

describe('master prompt', () => {
	const t = templateSchema.parse({
		id: 'x-test',
		name: 'x',
		engine: 'clip',
		masterPrompt: 'The {product} on {surface}, {surface} again, camera {motion}. Keep {unknown}.',
		options: {surface: ['marble', 'wood'], motion: ['push-in']},
	});
	it('lists placeholders once', () => {
		assert.deepEqual(promptPlaceholders(t.masterPrompt), ['product', 'surface', 'motion', 'unknown']);
	});
	it('fills product, chosen options, first option as default, and keeps unknown ones visible', () => {
		assert.equal(fillPrompt(t, 'vitamin C serum bottle', {surface: 'wood'}), 'The vitamin C serum bottle on wood, wood again, camera push-in. Keep {unknown}.');
		assert.equal(fillPrompt(t, '  ', {surface: 'not-an-option'}), 'The the product on marble, marble again, camera push-in. Keep {unknown}.');
	});
	it('reports placeholders without choices and a missing {product}', () => {
		assert.deepEqual(templateProblems(t), ['{unknown} is in the prompt but has no choices.']);
		const noProduct = templateSchema.parse({id: 'y-test', name: 'y', engine: 'clip', masterPrompt: 'A bottle on a table'});
		assert.ok(templateProblems(noProduct).some((p) => p.includes('{product}')));
		const slideshowWithPrompt = templateSchema.parse({id: 'z-test', name: 'z', engine: 'slideshow', masterPrompt: 'The {product}'});
		assert.ok(templateProblems(slideshowWithPrompt).length > 0);
	});
});

describe('style', () => {
	it('has defaults and rejects bad colours', () => {
		assert.equal(DEFAULT_STYLE.pace, 'normal');
		assert.ok(!styleSchema.safeParse({accent: 'red'}).success);
		assert.ok(!styleSchema.safeParse({pace: 'turbo'}).success);
	});
	it('picks readable text colours', () => {
		assert.ok(luminance('#FFFFFF') > 0.99 && luminance('#000000') < 0.01);
		assert.equal(readableOn('#FFD400'), '#16161A');
		assert.equal(readableOn('#2A1FB8'), '#FFFFFF');
	});
	it('resolves platform colour and keeps prices readable', () => {
		assert.equal(resolveTheme(DEFAULT_STYLE, 'shopee').primary, '#EE4D2D');
		assert.equal(resolveTheme(DEFAULT_STYLE, 'lazada').primary, '#2A1FB8');
		// neon cyan on a white card gets darkened, dark blue on a dark card gets lightened
		const cyanOnWhite = resolveTheme(styleSchema.parse({primary: '#00E5FF', card: 'white'}), 'shopee');
		assert.ok(luminance(cyanOnWhite.priceOnCard) < luminance('#00E5FF'));
		const blueOnDark = resolveTheme(styleSchema.parse({card: 'dark'}), 'lazada');
		assert.ok(luminance(blueOnDark.priceOnCard) > luminance('#2A1FB8'));
	});
});

describe('engine durations', () => {
	const base = productVideoSchema.parse({platform: 'shopee', title: 'x', price: 10, images: [{src: '/uploads/a.jpg'}]});
	it('slideshow follows the pace', () => {
		const fast = ENGINES.slideshow.durationInFrames({...base, style: styleSchema.parse({pace: 'fast'})});
		const slow = ENGINES.slideshow.durationInFrames({...base, style: styleSchema.parse({pace: 'slow'})});
		assert.ok(fast < slow);
		assert.equal(fast, PACE.fast.hookFrames + 3 * PACE.fast.shotFrames + PACE.fast.endFrames);
	});
	it('clip uses the clip length (capped) plus the end card', () => {
		assert.equal(clipFrames(undefined, 30), 150);
		assert.equal(clipFrames({src: '/uploads/c.mp4', durationInSeconds: 4.2, keepAudio: true}, 30), 126);
		assert.equal(clipFrames({src: '/uploads/c.mp4', durationInSeconds: 95, keepAudio: true}, 30), 600);
		const withClip = {...base, clip: {src: '/uploads/c.mp4', durationInSeconds: 4, keepAudio: true}};
		assert.equal(ENGINES.clip.durationInFrames(withClip), 120 + PACE.normal.endFrames);
	});
});

describe('template store', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-tpl-'));
	const store = new TemplateStore(dir);

	it('creates, updates, reloads and deletes custom templates', () => {
		const created = store.create({name: 'My Pink Sale', engine: 'slideshow', style: {primary: '#FF4FA3', pace: 'fast'}});
		assert.match(created.id, /^my-pink-sale-[0-9a-f]{6}$/);
		assert.equal(created.builtIn, false);
		const updated = store.update(created.id, {...created, name: 'My Pink Sale 2', engine: 'clip', builtIn: true});
		assert.equal(updated.name, 'My Pink Sale 2');
		assert.equal(updated.engine, 'slideshow', 'engine cannot change');
		assert.equal(updated.builtIn, false, 'cannot make itself built-in');
		assert.equal(new TemplateStore(dir).get(created.id)?.name, 'My Pink Sale 2', 'persisted to disk');
		store.delete(created.id);
		assert.equal(store.get(created.id), undefined);
		assert.equal(new TemplateStore(dir).get(created.id), undefined);
	});

	it('protects built-ins and rejects invalid templates', () => {
		assert.throws(() => store.update('flash-sale', {name: 'x'}), (e: TemplateError) => e.status === 403);
		assert.throws(() => store.delete('flash-sale'), (e: TemplateError) => e.status === 403);
		assert.throws(() => store.create({id: 'flash-sale', name: 'dup', engine: 'slideshow'}), (e: TemplateError) => e.status === 409);
		assert.throws(
			() => store.create({name: 'Bad AI', engine: 'clip', masterPrompt: 'The {product} on {surface}'}),
			(e: TemplateError) => e.status === 400 && e.problems.some((p) => p.includes('{surface}')),
		);
		assert.throws(() => store.create({name: '', engine: 'slideshow'}), (e: TemplateError) => e.status === 400);
	});

	it('makes readable ids', () => {
		assert.match(slugify('Flash Sale 11.11!'), /^flash-sale-11-11-[0-9a-f]{6}$/);
		assert.match(slugify('ลดแรง'), /^template-[0-9a-f]{6}$/);
	});
});
