import React, {useState} from 'react';
import {MAX_CLIP_SECONDS} from '../remotion/schema';
import {PRODUCT_PLACEHOLDER, fillPrompt, promptPlaceholders, type VideoTemplate} from '../shared/templates';
import {uploadFile} from './api';
import type {Form} from './form';

type Props = {
	form: Form;
	setForm: React.Dispatch<React.SetStateAction<Form>>;
	template: VideoTemplate;
};

const CLIP_TYPES = 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm';

async function copyText(text: string): Promise<boolean> {
	try {
		await Promise.race([
			navigator.clipboard.writeText(text),
			new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
		]);
		return true;
	} catch {
		return false;
	}
}

/**
 * Clip templates: for AI templates, fill the master prompt from the product and the
 * chosen options so it can be pasted into the AI video tool; then upload the clip.
 * When an AI provider is connected, a "Generate clip" button replaces the copy step.
 */
export const ClipSection: React.FC<Props> = ({form, setForm, template}) => {
	const [busy, setBusy] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [copied, setCopied] = useState<string | null>(null);
	const isAi = Boolean(template.masterPrompt);
	const keys = promptPlaceholders(template.masterPrompt).filter((k) => k !== PRODUCT_PLACEHOLDER && template.options[k]);
	const prompt = isAi ? fillPrompt(template, form.productEn, form.choices) : '';
	const cover = form.images[0];

	async function onCopy(label: string, text: string, el?: HTMLTextAreaElement | null) {
		const ok = await copyText(text);
		if (!ok && el) {
			el.select();
			document.execCommand('copy');
		}
		setCopied(label);
		setTimeout(() => setCopied(null), 2000);
	}

	async function onClip(file: File | undefined) {
		if (!file) return;
		setError(null);
		setBusy(0);
		try {
			const res = await uploadFile(file, file.name, (f) => setBusy(f));
			if (res.kind !== 'video' || !res.durationInSeconds) throw new Error('That file is not a video clip.');
			setForm((f) => ({
				...f,
				clip: {
					src: res.url,
					name: file.name,
					durationInSeconds: res.durationInSeconds!,
					width: res.width,
					height: res.height,
					keepAudio: !isAi,
				},
			}));
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(null);
		}
	}

	const clip = form.clip;
	const landscape = clip?.width && clip?.height && clip.width > clip.height;

	return (
		<div className="clip-section">
			{isAi ? (
				<>
					<p className="hint">
						No AI model is connected yet, so: <strong>1</strong> fill in below, <strong>2</strong> copy the prompt into your AI video tool
						(Kling, Seedance, Veo…) with the reference photo, 9:16, about {template.clipSeconds}s, <strong>3</strong> upload the clip it makes.
					</p>
					<label>
						Product in English (for the AI)
						<input
							value={form.productEn}
							maxLength={160}
							placeholder="e.g. vitamin C serum in an amber glass dropper bottle"
							onChange={(e) => setForm((f) => ({...f, productEn: e.target.value}))}
						/>
						<small>Short and visual: what it is, material, colour. AI video models understand English best.</small>
					</label>
					{keys.length ? (
						<div className="row wrap">
							{keys.map((key) => (
								<label key={key}>
									{key.replace(/_/g, ' ')}
									<select
										value={form.choices[key] ?? template.options[key][0]}
										onChange={(e) => setForm((f) => ({...f, choices: {...f.choices, [key]: e.target.value}}))}
									>
										{template.options[key].map((o) => (
											<option key={o} value={o}>
												{o}
											</option>
										))}
									</select>
								</label>
							))}
						</div>
					) : null}
					<div className="field">
						<span className="field-label">Prompt</span>
						<textarea className="prompt" readOnly rows={6} value={prompt} id="ai-prompt" />
						<div className="button-row">
							<button
								type="button"
								className="secondary"
								onClick={() => void onCopy('prompt', prompt, document.getElementById('ai-prompt') as HTMLTextAreaElement)}
							>
								{copied === 'prompt' ? 'Copied ✓' : 'Copy prompt'}
							</button>
							{template.negativePrompt ? (
								<button type="button" className="secondary" onClick={() => void onCopy('negative', template.negativePrompt)}>
									{copied === 'negative' ? 'Copied ✓' : 'Copy negative prompt'}
								</button>
							) : null}
							{cover ? (
								<a className="secondary-link" href={cover.src} download target="_blank" rel="noreferrer">
									Reference photo ↓
								</a>
							) : null}
						</div>
						<small>The reference photo goes to your AI tool too, so the photo permission above applies to it.</small>
					</div>
				</>
			) : (
				<p className="hint">Upload your own footage: unboxing, try-on, demo. Vertical 9:16 works best. The hook, price and button are added on top.</p>
			)}

			<div className="field">
				<span className="field-label">{isAi ? 'Upload the AI clip' : 'Your clip'}</span>
				{clip ? (
					<div className="clip-chip">
						<span className="clip-name">
							🎬 {clip.name} · {clip.durationInSeconds.toFixed(1)}s{clip.width ? ` · ${clip.width}×${clip.height}` : ''}
						</span>
						<button type="button" onClick={() => setForm((f) => ({...f, clip: undefined}))}>
							Remove
						</button>
					</div>
				) : (
					<label className="file-button">
						<input
							type="file"
							accept={CLIP_TYPES}
							onChange={(e) => {
								void onClip(e.target.files?.[0]);
								e.target.value = '';
							}}
						/>
						{busy !== null ? `Uploading ${Math.round(busy * 100)}%…` : 'Choose video (MP4 / MOV)'}
					</label>
				)}
				{clip ? (
					<label className="check">
						<input
							type="checkbox"
							checked={clip.keepAudio}
							onChange={(e) => setForm((f) => (f.clip ? {...f, clip: {...f.clip, keepAudio: e.target.checked}} : f))}
						/>
						<span>Keep the clip's own sound</span>
					</label>
				) : null}
				{landscape ? <p className="hint warn">This clip is horizontal; it will be cropped to fill the 9:16 frame.</p> : null}
				{clip && clip.durationInSeconds > MAX_CLIP_SECONDS ? (
					<p className="hint warn">Only the first {MAX_CLIP_SECONDS} seconds are used.</p>
				) : null}
				{!clip ? <small>Until a clip is uploaded, the preview shows your cover photo in its place.</small> : null}
				{error ? <p className="hint error">{error}</p> : null}
			</div>
		</div>
	);
};
