/**
 * Render the sample product without the web app.
 *
 *   npm run render:sample                      -> out/sample.mp4
 *   npm run render:sample -- --stills          -> out/stills/*.png (key frames only, fast)
 *   npm run render:sample -- --images=1 --lazada --hide-price
 */
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type {AddressInfo} from 'node:net';
import {productVideoSchema, type ProductVideoProps} from '../src/remotion/schema';
import {planSlideshow} from '../src/remotion/templates/slideshow-plan';
import {ROOT, renderFrame, renderVideo} from '../src/server/render';

const args = new Set(process.argv.slice(2));
const imagesArg = process.argv.find((a) => a.startsWith('--images='));
const imageCount = imagesArg ? Number(imagesArg.split('=')[1]) : 4;

const app = express();
app.use(express.static(path.join(ROOT, 'public')));
const server = app.listen(0);
const port = (server.address() as AddressInfo).port;
const base = `http://localhost:${port}`;

const props: ProductVideoProps = productVideoSchema.parse({
	platform: args.has('--lazada') ? 'lazada' : 'shopee',
	affiliateLink: 'https://s.shopee.co.th/example',
	title: '【พร้อมส่ง】เซรั่มวิตามินซี ผิวกระจ่างใส 30ml [ของแท้100%] ลดฝ้า กระ จุดด่างดำ',
	hook: 'ของมันต้องมี!',
	price: 289,
	originalPrice: 590,
	rating: 4.9,
	sold: 12340,
	hidePrice: args.has('--hide-price'),
	images: [1, 2, 3, 4].slice(0, imageCount).map((n) => ({src: `${base}/samples/product-${n}.jpg`})),
});

const templateId = 'multi-angle-slideshow';
const outDir = path.join(ROOT, 'out');
fs.mkdirSync(outDir, {recursive: true});

try {
	if (args.has('--stills')) {
		const plan = planSlideshow(props.images);
		const stillsDir = path.join(outDir, 'stills');
		fs.mkdirSync(stillsDir, {recursive: true});
		const frames = [
			...plan.shots.map((s) => s.from + Math.min(s.duration - 1, 40)),
			plan.endFrom + 60,
		];
		for (const frame of frames) {
			const output = path.join(stillsDir, `frame-${String(frame).padStart(4, '0')}.png`);
			await renderFrame({templateId, props, frame, output});
			console.log('still', output);
		}
	} else {
		const output = path.join(outDir, 'sample.mp4');
		let last = -1;
		await renderVideo({
			templateId,
			props,
			outputLocation: output,
			onProgress: (p) => {
				const pct = Math.floor(p * 10) * 10;
				if (pct !== last) console.log(`render ${pct}%`), (last = pct);
			},
		});
		console.log('video', output);
	}
} finally {
	server.close();
}
