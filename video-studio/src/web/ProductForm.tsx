import React, {useState} from 'react';
import {ENGINES} from '../remotion/engines';
import type {VideoTemplate} from '../shared/templates';
import {detectPlatform} from '../shared/links';
import {uploadFile} from './api';
import {ClipSection} from './ClipSection';
import {HOOKS, type Form} from './form';
import {ImageUploader} from './ImageUploader';
import {RightsCheck} from './RightsCheck';
import {TemplatePicker} from './TemplatePicker';

type Props = {
	form: Form;
	setForm: React.Dispatch<React.SetStateAction<Form>>;
	template: VideoTemplate;
	templates: VideoTemplate[];
};

export const ProductForm: React.FC<Props> = ({form, setForm, template, templates}) => {
	const [musicError, setMusicError] = useState<string | null>(null);
	const [musicBusy, setMusicBusy] = useState(false);
	const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({...f, [key]: value}));
	const engine = ENGINES[template.engine];
	let section = 0;
	const next = () => ++section;

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
			<h2>{next()} · Product</h2>
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
				<input value={form.title} maxLength={120} enterKeyHint="next" onChange={(e) => set('title', e.target.value)} placeholder="Paste the listing title" />
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

			<h2>{next()} · Photos</h2>
			<ImageUploader
				images={form.images}
				onChange={(nextImages) => setForm((f) => ({...f, images: typeof nextImages === 'function' ? nextImages(f.images) : nextImages}))}
				max={engine.maxImages}
				recommended={template.engine === 'slideshow' ? 4 : 1}
			/>
			{template.engine === 'clip' ? <p className="hint">Clip templates use the first photo for the end card{template.masterPrompt ? ' and as the AI reference' : ''}.</p> : null}
			<RightsCheck form={form} setForm={setForm} />

			<h2>{next()} · Template</h2>
			<TemplatePicker templates={templates} selectedId={template.id} platform={form.platform} onSelect={(id) => set('templateId', id)} />
			{template.description ? <p className="hint">{template.description}</p> : null}

			{template.engine === 'clip' ? (
				<>
					<h2>
						{next()} · {template.masterPrompt ? 'AI clip' : 'Your clip'}
					</h2>
					<ClipSection form={form} setForm={setForm} template={template} />
				</>
			) : null}

			<h2>{next()} · Text & music</h2>
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
		</>
	);
};
