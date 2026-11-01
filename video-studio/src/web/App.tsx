import {Player} from '@remotion/player';
import React, {useEffect, useMemo, useState} from 'react';
import {productVideoSchema, type ProductVideoInput, type ProductVideoProps} from '../remotion/schema';
import {TEMPLATES, getTemplate} from '../remotion/templates/registry';
import {buildCaption} from '../shared/caption';
import {detectPlatform} from '../shared/links';
import {createJob, getJob, listJobs, uploadFile, type JobView} from './api';
import {ImageUploader, type UploadedImage} from './ImageUploader';

type Form = {
	platform: 'shopee' | 'lazada';
	affiliateLink: string;
	title: string;
	hook: string;
	price: string;
	originalPrice: string;
	rating: string;
	sold: string;
	hidePrice: boolean;
	cta: string;
	ctaSub: string;
	images: UploadedImage[];
	music?: {src: string; name: string};
	templateId: string;
};

const EMPTY: Form = {
	platform: 'shopee',
	affiliateLink: '',
	title: '',
	hook: 'ของมันต้องมี!',
	price: '',
	originalPrice: '',
	rating: '',
	sold: '',
	hidePrice: false,
	cta: 'กดตะกร้าเลย',
	ctaSub: 'ลิงก์อยู่ในไบโอ',
	images: [],
	templateId: TEMPLATES[0].id,
};

const SAMPLE: Form = {
	...EMPTY,
	affiliateLink: 'https://s.shopee.co.th/example',
	title: '【พร้อมส่ง】เซรั่มวิตามินซี ผิวกระจ่างใส 30ml [ของแท้100%] ลดฝ้า กระ จุดด่างดำ',
	price: '289',
	originalPrice: '590',
	rating: '4.9',
	sold: '12340',
	images: [1, 2, 3, 4].map((n) => ({
		id: `sample-${n}`,
		src: `/samples/product-${n}.jpg`,
		width: 1000,
		height: 1000,
		name: `sample ${n}`,
	})),
};

const HOOKS = ['ของมันต้องมี!', 'ลดแรงมาก!', 'ของดีบอกต่อ', 'ใครยังไม่มีต้องดู', 'ปังมาก!'];

function num(s: string): number | undefined {
	const cleaned = s.replace(/[,\s฿]/g, '');
	if (!cleaned) return undefined;
	const n = Number(cleaned);
	return Number.isFinite(n) ? n : NaN;
}

function toInput(f: Form): ProductVideoInput {
	return {
		platform: f.platform,
		affiliateLink: f.affiliateLink,
		title: f.title,
		hook: f.hook,
		price: num(f.price) ?? 0,
		originalPrice: num(f.originalPrice),
		rating: num(f.rating),
		sold: num(f.sold) === undefined ? undefined : Math.round(num(f.sold)!),
		hidePrice: f.hidePrice,
		cta: f.cta,
		ctaSub: f.ctaSub,
		images: f.images.map(({src, width, height}) => ({src, width, height})),
		music: f.music?.src,
	};
}

export const App: React.FC = () => {
	const [form, setForm] = useState<Form>(EMPTY);
	const [job, setJob] = useState<JobView | null>(null);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [history, setHistory] = useState<JobView[]>([]);
	const [copied, setCopied] = useState(false);

	const template = getTemplate(form.templateId) ?? TEMPLATES[0];
	const parsed = useMemo(() => productVideoSchema.safeParse(toInput(form)), [form]);
	const props: ProductVideoProps | null = parsed.success ? parsed.data : null;
	const problems = parsed.success ? [] : parsed.error.issues.map((i) => i.message);

	const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({...f, [key]: value}));

	useEffect(() => {
		listJobs().then(setHistory).catch(() => undefined);
	}, []);

	// Poll the active job until it finishes.
	useEffect(() => {
		if (!job || job.status === 'done' || job.status === 'failed') return;
		const t = setTimeout(async () => {
			try {
				const next = await getJob(job.id);
				setJob(next);
				if (next.status === 'done' || next.status === 'failed') listJobs().then(setHistory).catch(() => undefined);
			} catch (err) {
				setSubmitError(err instanceof Error ? err.message : String(err));
			}
		}, 1000);
		return () => clearTimeout(t);
	}, [job]);

	async function submit() {
		if (!props) return;
		setSubmitError(null);
		setCopied(false);
		try {
			setJob(await createJob(template.id, props));
		} catch (err) {
			setSubmitError(err instanceof Error ? err.message : String(err));
		}
	}

	async function onMusic(file: File | undefined) {
		if (!file) return;
		try {
			const res = await uploadFile(file, file.name);
			set('music', {src: res.url, name: file.name});
		} catch (err) {
			setSubmitError(err instanceof Error ? err.message : String(err));
		}
	}

	const rendering = job?.status === 'queued' || job?.status === 'rendering';
	const durationInFrames = props ? template.durationInFrames(props) : 1;

	return (
		<div className="app">
			<header>
				<h1>Video Studio</h1>
				<span className="tag">Phase 0</span>
				<button type="button" className="link" onClick={() => setForm(SAMPLE)}>
					Load sample product
				</button>
			</header>

			<main>
				<section className="panel form">
					<h2>1 · Product</h2>
					<label>
						Affiliate link
						<input
							type="url"
							placeholder="https://s.shopee.co.th/… or https://s.lazada.co.th/…"
							value={form.affiliateLink}
							onChange={(e) => {
								const link = e.target.value;
								const detected = detectPlatform(link);
								setForm((f) => ({...f, affiliateLink: link, platform: detected ?? f.platform}));
							}}
						/>
					</label>
					<div className="segmented" role="radiogroup" aria-label="Platform">
						{(['shopee', 'lazada'] as const).map((p) => (
							<button
								key={p}
								type="button"
								role="radio"
								aria-checked={form.platform === p}
								className={form.platform === p ? `on ${p}` : ''}
								onClick={() => set('platform', p)}
							>
								{p === 'shopee' ? 'Shopee' : 'Lazada'}
							</button>
						))}
					</div>

					<label>
						Product name
						<input value={form.title} maxLength={120} onChange={(e) => set('title', e.target.value)} placeholder="Paste the listing title; tags like 【พร้อมส่ง】 are removed automatically" />
					</label>

					<div className="row">
						<label>
							Price (฿)
							<input inputMode="decimal" value={form.price} onChange={(e) => set('price', e.target.value)} placeholder="289" />
						</label>
						<label>
							Original price (฿)
							<input inputMode="decimal" value={form.originalPrice} onChange={(e) => set('originalPrice', e.target.value)} placeholder="590" />
						</label>
					</div>
					<div className="row">
						<label>
							Rating
							<input inputMode="decimal" value={form.rating} onChange={(e) => set('rating', e.target.value)} placeholder="4.9" />
						</label>
						<label>
							Sold
							<input inputMode="numeric" value={form.sold} onChange={(e) => set('sold', e.target.value)} placeholder="12340" />
						</label>
					</div>
					<label className="check">
						<input type="checkbox" checked={form.hidePrice} onChange={(e) => set('hidePrice', e.target.checked)} />
						Hide exact price (show “ราคาพิเศษ” + discount %), for videos that stay up long after the price changes
					</label>

					<h2>2 · Images</h2>
					<ImageUploader
						images={form.images}
						onChange={(next) => setForm((f) => ({...f, images: typeof next === 'function' ? next(f.images) : next}))}
						max={template.maxImages}
						recommended={template.recommendedImages}
					/>

					<h2>3 · Text & music</h2>
					<label>
						Hook (first 2 seconds)
						<input value={form.hook} maxLength={40} onChange={(e) => set('hook', e.target.value)} />
					</label>
					<div className="chips">
						{HOOKS.map((h) => (
							<button key={h} type="button" className={form.hook === h ? 'on' : ''} onClick={() => set('hook', h)}>
								{h}
							</button>
						))}
					</div>
					<div className="row">
						<label>
							Button text
							<input value={form.cta} maxLength={32} onChange={(e) => set('cta', e.target.value)} />
						</label>
						<label>
							Under the button
							<input value={form.ctaSub} maxLength={40} onChange={(e) => set('ctaSub', e.target.value)} />
						</label>
					</div>
					<label>
						Background music (optional)
						<span className="file-row">
							<input type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav" onChange={(e) => void onMusic(e.target.files?.[0])} />
							{form.music ? (
								<button type="button" className="link" onClick={() => set('music', undefined)}>
									Remove {form.music.name}
								</button>
							) : null}
						</span>
						<small>Tip: leave it empty and add a trending sound inside TikTok / Shopee Video when posting.</small>
					</label>

					<h2>4 · Template</h2>
					<div className="templates">
						{TEMPLATES.map((t) => (
							<button
								key={t.id}
								type="button"
								className={`template${t.id === form.templateId ? ' on' : ''}`}
								onClick={() => set('templateId', t.id)}
							>
								<strong>{t.name}</strong>
								<span className="th">{t.nameTh}</span>
								<span>{t.description}</span>
								<span className="meta">
									{t.width}×{t.height} · {t.minImages}–{t.maxImages} images
								</span>
							</button>
						))}
					</div>
				</section>

				<section className="panel preview">
					<div className="player-wrap">
						{props ? (
							<Player
								component={template.component}
								inputProps={props}
								durationInFrames={durationInFrames}
								compositionWidth={template.width}
								compositionHeight={template.height}
								fps={template.fps}
								controls
								loop
								autoPlay
								acknowledgeRemotionLicense
								style={{width: '100%', aspectRatio: `${template.width} / ${template.height}`}}
							/>
						) : (
							<div className="placeholder">
								<p>Live preview appears here</p>
								<ul>
									{problems.map((p, i) => (
										<li key={i}>{p}</li>
									))}
								</ul>
							</div>
						)}
					</div>
					{props ? <p className="duration">{(durationInFrames / template.fps).toFixed(1)}s · 1080×1920 · 30fps</p> : null}

					<button type="button" className="primary" disabled={!props || rendering} onClick={() => void submit()}>
						{rendering ? 'Rendering…' : 'Generate video'}
					</button>
					{submitError ? <p className="hint error">{submitError}</p> : null}

					{job ? (
						<div className="job">
							{rendering ? (
								<>
									<div className="progress">
										<div style={{width: `${Math.round(job.progress * 100)}%`}} />
									</div>
									<p className="hint">
										{job.status === 'queued'
											? `Queued (position ${job.queuePosition})`
											: `Rendering ${Math.round(job.progress * 100)}%`}
									</p>
								</>
							) : null}
							{job.status === 'failed' ? <p className="hint error">Render failed: {job.error}</p> : null}
							{job.status === 'done' && job.videoUrl ? (
								<>
									<video src={job.videoUrl} controls playsInline className="result" />
									<a className="primary ghost" href={job.videoUrl} download={`video-${job.id.slice(0, 8)}.mp4`}>
										Download MP4
									</a>
								</>
							) : null}
							<label>
								Caption
								<textarea readOnly rows={7} value={job.caption} />
							</label>
							<button
								type="button"
								onClick={() => {
									void navigator.clipboard.writeText(job.caption).then(() => setCopied(true));
								}}
							>
								{copied ? 'Copied' : 'Copy caption'}
							</button>
						</div>
					) : props ? (
						<details className="caption-preview">
							<summary>Caption preview</summary>
							<pre>{buildCaption(props)}</pre>
						</details>
					) : null}

					{history.length ? (
						<div className="history">
							<h3>Recent videos</h3>
							<ul>
								{history.map((h) => (
									<li key={h.id}>
										<span className={`status ${h.status}`}>{h.status}</span>
										<span className="title">{h.title}</span>
										{h.videoUrl ? (
											<a href={h.videoUrl} download>
												MP4
											</a>
										) : null}
									</li>
								))}
							</ul>
						</div>
					) : null}
				</section>
			</main>
		</div>
	);
};
