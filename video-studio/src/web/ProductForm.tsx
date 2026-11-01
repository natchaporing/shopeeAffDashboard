import React, {useState} from 'react';
import {TEMPLATES, type TemplateManifest} from '../remotion/templates/registry';
import {detectPlatform} from '../shared/links';
import {uploadFile} from './api';
import {HOOKS, type Form} from './form';
import {ImageUploader} from './ImageUploader';

type Props = {
	form: Form;
	setForm: React.Dispatch<React.SetStateAction<Form>>;
	template: TemplateManifest;
};

export const ProductForm: React.FC<Props> = ({form, setForm, template}) => {
	const [musicError, setMusicError] = useState<string | null>(null);
	const [musicBusy, setMusicBusy] = useState(false);
	const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({...f, [key]: value}));

	async function onMusic(file: File | undefined) {
		if (!file) return;
		setMusicError(null);
		setMusicBusy(true);
		try {
			const res = await uploadFile(file, file.name);
			set('music', {src: res.url, name: file.name});
		} catch (err) {
			setMusicError(err instanceof Error ? err.message : String(err));
		} finally {
			setMusicBusy(false);
		}
	}

	return (
		<>
			<h2>1 · Product</h2>
			<label>
				Affiliate link
				<input
					type="url"
					inputMode="url"
					autoComplete="off"
					autoCapitalize="off"
					spellCheck={false}
					enterKeyHint="next"
					placeholder="https://s.shopee.co.th/…"
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
				<input
					value={form.title}
					maxLength={120}
					enterKeyHint="next"
					onChange={(e) => set('title', e.target.value)}
					placeholder="Paste the listing title"
				/>
				<small>Tags like 【พร้อมส่ง】 are removed in the video automatically.</small>
			</label>

			<div className="row">
				<label>
					Price (฿)
					<input inputMode="decimal" enterKeyHint="next" value={form.price} onChange={(e) => set('price', e.target.value)} placeholder="289" />
				</label>
				<label>
					Original price (฿)
					<input inputMode="decimal" enterKeyHint="next" value={form.originalPrice} onChange={(e) => set('originalPrice', e.target.value)} placeholder="590" />
				</label>
			</div>
			<div className="row">
				<label>
					Rating
					<input inputMode="decimal" enterKeyHint="next" value={form.rating} onChange={(e) => set('rating', e.target.value)} placeholder="4.9" />
				</label>
				<label>
					Sold
					<input inputMode="numeric" enterKeyHint="done" value={form.sold} onChange={(e) => set('sold', e.target.value)} placeholder="12340" />
				</label>
			</div>
			<label className="check">
				<input type="checkbox" checked={form.hidePrice} onChange={(e) => set('hidePrice', e.target.checked)} />
				<span>
					Hide exact price
					<small>Shows “ราคาพิเศษ” + discount % instead, for videos that stay up after the price changes.</small>
				</span>
			</label>

			<h2>2 · Photos</h2>
			<ImageUploader
				images={form.images}
				onChange={(next) => setForm((f) => ({...f, images: typeof next === 'function' ? next(f.images) : next}))}
				max={template.maxImages}
				recommended={template.recommendedImages}
			/>

			<h2>3 · Text & music</h2>
			<label>
				Hook (first 2 seconds)
				<input value={form.hook} maxLength={40} enterKeyHint="done" onChange={(e) => set('hook', e.target.value)} />
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
			<div className="field">
				<span className="field-label">Background music (optional)</span>
				{form.music ? (
					<div className="music-chip">
						<span>♪ {form.music.name}</span>
						<button type="button" onClick={() => set('music', undefined)}>
							Remove
						</button>
					</div>
				) : (
					<label className="file-button">
						<input
							type="file"
							accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,.mp3,.m4a,.wav"
							onChange={(e) => {
								void onMusic(e.target.files?.[0]);
								e.target.value = '';
							}}
						/>
						{musicBusy ? 'Uploading…' : 'Choose MP3 / M4A'}
					</label>
				)}
				<small>Tip: leave it empty and add a trending sound inside TikTok / Shopee Video when posting.</small>
				{musicError ? <p className="hint error">{musicError}</p> : null}
			</div>

			<h2>4 · Template</h2>
			<div className="templates">
				{TEMPLATES.map((t) => (
					<button
						key={t.id}
						type="button"
						className={`template${t.id === form.templateId ? ' on' : ''}`}
						onClick={() => set('templateId', t.id)}
						aria-pressed={t.id === form.templateId}
					>
						<strong>{t.name}</strong>
						<span className="th">{t.nameTh}</span>
						<span>{t.description}</span>
						<span className="meta">
							{t.width}×{t.height} · {t.minImages}–{t.maxImages} photos
						</span>
					</button>
				))}
			</div>
		</>
	);
};
