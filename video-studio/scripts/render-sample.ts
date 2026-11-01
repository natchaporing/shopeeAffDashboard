/**
 * Render the sample product without the web app.
 *
 *   npm run render:sample                                   -> out/<template>.mp4
 *   npm run render:sample -- --template=flash-sale          -> pick a built-in template
 *   npm run render:sample -- --stills                       -> key frames only (fast), out/stills/<template>/
 *   npm run render:sample -- --frames=0,24                  -> exact frames
 *   npm run render:sample -- --all --stills                 -> key frames of every built-in template
 *   npm run render:sample -- --template=own-clip --clip=path/to/clip.mp4
 *   npm run render:sample -- --images=1 --lazada --hide-price
 */
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type {AddressInfo} from 'node:net';
import {ENGINES} from '../src/remotion/engines';
import {productVideoSchema, type ProductVideoProps} from '../src/remotion/schema';
import {PACE} from '../src/remotion/style';
import {planSlideshow} from '../src/remotion/templates/slideshow-plan';
import {clipFrames} from '../src/remotion/templates/ClipOverlay';
import {ROOT, renderFrame, renderVideo} from '../src/server/render';
import {BUILT_IN_TEMPLATES} from '../src/shared/templates';
import {probeVideo} from '../src/server/media';

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const value = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

const imageCount = Number(value('images') ?? 4);
const clipPath = value('clip');
const templates = flag('all') ? BUILT_IN_TEMPLATES : BUILT_IN_TEMPLATES.filter((t) => t.id === (value('template') ?? 'multi-angle-slideshow'));
if (!templates.length) throw new Error(`Unknown template ${value('template')}`);

const app = express();
// the renderer's page runs on another port and @remotion/media fetches clips: allow CORS
app.use((_req, res, next) => {
	res.setHeader('Access-Control-Allow-Origin', '*');
	next();
});
app.use(express.static(path.join(ROOT, 'public')));
if (clipPath) app.get('/clip', (_req, res) => res.sendFile(path.resolve(clipPath)));
const server = app.listen(0);
const base = `http://localhost:${(server.address() as AddressInfo).port}`;
const outDir = path.join(ROOT, 'out');

try {
	const clipInfo = clipPath ? await probeVideo(path.resolve(clipPath)) : null;
	for (const template of templates) {
		const engine = ENGINES[template.engine];
		const props: ProductVideoProps = productVideoSchema.parse({
			platform: flag('lazada') ? 'lazada' : 'shopee',
			affiliateLink: 'https://s.shopee.co.th/example',
			title: '【พร้อมส่ง】เซรั่มวิตามินซี ผิวกระจ่างใส 30ml [ของแท้100%] ลดฝ้า กระ จุดด่างดำ',
			hook: 'ของมันต้องมี!',
			price: 289,
			originalPrice: 590,
			rating: 4.9,
			sold: 12340,
			hidePrice: flag('hide-price'),
			images: [1, 2, 3, 4].slice(0, imageCount).map((n) => ({src: `${base}/samples/product-${n}.jpg`})),
			clip: clipInfo && engine.usesClip ? {src: `${base}/clip`, ...clipInfo} : undefined,
			style: template.style,
		});

		if (flag('stills') || value('frames')) {
			let frames: number[];
			if (value('frames')) frames = value('frames')!.split(',').map(Number);
			else if (template.engine === 'slideshow') {
				const plan = planSlideshow(props.images, PACE[props.style.pace]);
				frames = [0, ...plan.shots.slice(1, -1).map((s) => s.from + Math.round(s.duration * 0.6)), plan.endFrom + 60];
			} else {
				const main = clipFrames(props.clip, engine.fps);
				frames = [0, Math.round(main / 2), main + 60];
			}
			const dir = path.join(outDir, 'stills', template.id);
			fs.mkdirSync(dir, {recursive: true});
			for (const frame of frames) {
				const output = path.join(dir, `frame-${String(frame).padStart(4, '0')}.png`);
				await renderFrame({compositionId: template.engine, props, frame, output});
				console.log('still', output);
			}
		} else {
			fs.mkdirSync(outDir, {recursive: true});
			const output = path.join(outDir, `${template.id}.mp4`);
			let last = -1;
			await renderVideo({
				compositionId: template.engine,
				props,
				outputLocation: output,
				onProgress: (p) => {
					const pct = Math.floor(p * 10) * 10;
					if (pct !== last) console.log(`render ${template.id} ${pct}%`), (last = pct);
				},
			});
			console.log('video', output);
		}
	}
} finally {
	server.close();
}
