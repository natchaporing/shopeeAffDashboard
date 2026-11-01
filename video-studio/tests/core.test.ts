import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {cleanTitle, discountPercent, formatBaht, formatCount} from '../src/remotion/format';
import {productVideoSchema} from '../src/remotion/schema';
import {TIMING, planSlideshow} from '../src/remotion/templates/slideshow-plan';
import {buildCaption} from '../src/shared/caption';
import {detectPlatform, isAllowedAssetPath} from '../src/shared/links';
import {validateJobRequest} from '../src/server/validate';
import {BUILT_IN_TEMPLATES} from '../src/shared/templates';

const img = (n: number) => ({src: `/uploads/img-${n}.jpg`});

describe('format', () => {
	it('formats baht', () => {
		assert.equal(formatBaht(289), '฿289');
		assert.equal(formatBaht(1290), '฿1,290');
		assert.equal(formatBaht(99.5), '฿99.50');
	});
	it('computes discount only when real', () => {
		assert.equal(discountPercent(289, 590), 51);
		assert.equal(discountPercent(100, 100), null);
		assert.equal(discountPercent(100, 90), null);
		assert.equal(discountPercent(100), null);
		assert.equal(discountPercent(99.6, 100), null);
	});
	it('shortens counts', () => {
		assert.equal(formatCount(950), '950');
		assert.equal(formatCount(12_340), '12.3k');
		assert.equal(formatCount(2_000), '2k');
		assert.equal(formatCount(1_500_000), '1.5M');
	});
	it('cleans keyword-stuffed titles', () => {
		assert.equal(cleanTitle('【พร้อมส่ง】หูฟังบลูทูธ [ของแท้100%] TWS'), 'หูฟังบลูทูธ TWS');
		const long = cleanTitle('เซรั่มวิตามินซี ผิวกระจ่างใส 30ml ลดฝ้า กระ จุดด่างดำ ผิวชุ่มชื้น ไม่มีน้ำหอม');
		assert.ok(long.length <= 49, long);
		assert.ok(long.endsWith('…'));
		assert.equal(cleanTitle('【】'), '【】');
	});
});

describe('slideshow plan', () => {
	it('pads a single image with detail shots', () => {
		const plan = planSlideshow([img(1)]);
		const kinds = plan.shots.map((s) => s.kind);
		assert.deepEqual(kinds, ['hook', 'detail', 'detail', 'detail', 'end']);
		const foci = plan.shots.filter((s) => s.kind === 'detail').map((s) => `${s.zoom.originX},${s.zoom.originY}`);
		assert.equal(new Set(foci).size, foci.length, 'detail shots should focus on different spots');
	});
	it('uses every gallery image and no padding when there are enough', () => {
		const plan = planSlideshow([1, 2, 3, 4].map(img));
		assert.deepEqual(
			plan.shots.map((s) => s.kind),
			['hook', 'gallery', 'gallery', 'gallery', 'end'],
		);
		assert.deepEqual(
			plan.shots.slice(1, 4).map((s) => s.image.src),
			['/uploads/img-2.jpg', '/uploads/img-3.jpg', '/uploads/img-4.jpg'],
		);
	});
	it('has contiguous shots and the expected duration', () => {
		for (const n of [1, 2, 3, 4, 10]) {
			const plan = planSlideshow(Array.from({length: n}, (_, i) => img(i)));
			let t = 0;
			for (const s of plan.shots) {
				assert.equal(s.from, t);
				t += s.duration;
			}
			const gallery = Math.max(TIMING.minGalleryShots, n - 1);
			assert.equal(plan.durationInFrames, TIMING.hookFrames + gallery * TIMING.shotFrames + TIMING.endFrames);
			assert.equal(plan.endFrom, plan.durationInFrames - TIMING.endFrames);
		}
	});
	it('rejects an empty list', () => {
		assert.throws(() => planSlideshow([]));
	});
});

describe('links', () => {
	it('detects platforms', () => {
		assert.equal(detectPlatform('https://s.shopee.co.th/AbC123'), 'shopee');
		assert.equal(detectPlatform('https://shopee.co.th/product-i.1.2'), 'shopee');
		assert.equal(detectPlatform('https://shp.ee/xyz'), 'shopee');
		assert.equal(detectPlatform('https://s.lazada.co.th/s.abc'), 'lazada');
		assert.equal(detectPlatform('https://www.lazada.co.th/products/x-i1-s2.html'), 'lazada');
		assert.equal(detectPlatform('https://example.com'), null);
		assert.equal(detectPlatform('not a url'), null);
		assert.equal(detectPlatform('https://notshopee.com'), null);
	});
	it('only allows local asset paths', () => {
		assert.ok(isAllowedAssetPath('/uploads/3f2a.jpg'));
		assert.ok(isAllowedAssetPath('/samples/product-1.jpg'));
		assert.ok(!isAllowedAssetPath('http://169.254.169.254/latest'));
		assert.ok(!isAllowedAssetPath('/uploads/../.env'));
		assert.ok(!isAllowedAssetPath('/etc/passwd'));
		assert.ok(!isAllowedAssetPath('/uploads/a/b.jpg'));
	});
});

const baseProps = {
	platform: 'shopee' as const,
	title: 'เซรั่มวิตามินซี',
	price: 289,
	originalPrice: 590,
	rating: 4.9,
	sold: 12340,
	images: [img(1)],
};

describe('caption', () => {
	it('includes price drop, proof, link and tags', () => {
		const caption = buildCaption(productVideoSchema.parse({...baseProps, hook: 'ของมันต้องมี!', affiliateLink: 'https://s.shopee.co.th/x'}));
		assert.match(caption, /^ของมันต้องมี! เซรั่มวิตามินซี/);
		assert.match(caption, /เหลือ ฿289 จาก ฿590 \(ลด 51%\)/);
		assert.match(caption, /⭐ 4.9 \| ขายแล้ว 12.3k ชิ้น/);
		assert.match(caption, /พิกัด: https:\/\/s.shopee.co.th\/x/);
		assert.match(caption, /#shopee/);
	});
	it('hides the price when asked', () => {
		const caption = buildCaption(productVideoSchema.parse({...baseProps, hidePrice: true, platform: 'lazada'}));
		assert.doesNotMatch(caption, /฿/);
		assert.match(caption, /ลดสูงสุด 51%/);
		assert.match(caption, /#lazada/);
	});
});

const deps = {
	getTemplate: (id: string) => BUILT_IN_TEMPLATES.find((t) => t.id === id),
	clipInfo: (src: string) => (src === '/uploads/clip.mp4' ? {durationInSeconds: 6.5, width: 1080, height: 1920} : undefined),
};

describe('job validation', () => {
	it('accepts a valid request and applies defaults', () => {
		const res = validateJobRequest({templateId: 'multi-angle-slideshow', props: baseProps}, deps);
		assert.ok(res.ok);
		if (res.ok) {
			assert.equal(res.value.props.cta, 'กดตะกร้าเลย');
			assert.equal(res.value.props.hidePrice, false);
			assert.equal(res.value.compositionId, 'slideshow');
		}
	});
	it('uses the template style, not one sent by the client', () => {
		const res = validateJobRequest({templateId: 'flash-sale', props: {...baseProps, style: {ribbon: 'HACKED', pace: 'slow'}}}, deps);
		assert.ok(res.ok);
		if (res.ok) {
			assert.equal(res.value.props.style.ribbon, 'FLASH SALE');
			assert.equal(res.value.props.style.pace, 'fast');
		}
	});
	it('rejects unknown templates, remote images and missing fields', () => {
		const unknown = validateJobRequest({templateId: 'nope', props: baseProps}, deps);
		assert.ok(!unknown.ok && unknown.errors.some((e) => e.includes('Unknown template')));
		const remote = validateJobRequest({templateId: 'multi-angle-slideshow', props: {...baseProps, images: [{src: 'http://evil/x.jpg'}]}}, deps);
		assert.ok(!remote.ok && remote.errors.some((e) => e.includes('uploaded file')));
		const missing = validateJobRequest({templateId: 'multi-angle-slideshow', props: {...baseProps, images: [], price: 0}}, deps);
		assert.ok(!missing.ok);
	});
	it('enforces the engine image limit', () => {
		const res = validateJobRequest({templateId: 'multi-angle-slideshow', props: {...baseProps, images: Array.from({length: 11}, (_, i) => img(i))}}, deps);
		assert.ok(!res.ok);
	});
	it('clip templates need an uploaded clip and use the measured duration', () => {
		const none = validateJobRequest({templateId: 'ai-hero-shot', props: baseProps}, deps);
		assert.ok(!none.ok && none.errors.some((e) => e.includes('AI clip')));
		const remote = validateJobRequest({templateId: 'own-clip', props: {...baseProps, clip: {src: 'http://evil/c.mp4', durationInSeconds: 3}}}, deps);
		assert.ok(!remote.ok);
		const unknownFile = validateJobRequest({templateId: 'own-clip', props: {...baseProps, clip: {src: '/uploads/gone.mp4', durationInSeconds: 3}}}, deps);
		assert.ok(!unknownFile.ok && unknownFile.errors.some((e) => e.includes('not found')));
		const ok = validateJobRequest({templateId: 'own-clip', props: {...baseProps, clip: {src: '/uploads/clip.mp4', durationInSeconds: 30}}}, deps);
		assert.ok(ok.ok);
		if (ok.ok) {
			assert.equal(ok.value.props.clip?.durationInSeconds, 6.5, 'server measurement wins');
			assert.equal(ok.value.compositionId, 'clip');
		}
	});
	it('drops a clip sent to a slideshow template', () => {
		const res = validateJobRequest({templateId: 'gadget-dark', props: {...baseProps, clip: {src: '/uploads/clip.mp4', durationInSeconds: 3}}}, deps);
		assert.ok(res.ok && res.value.props.clip === undefined);
	});
});
