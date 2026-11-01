import {Player} from '@remotion/player';
import React, {useMemo, useState} from 'react';
import {ENGINES} from '../remotion/engines';
import {productVideoSchema} from '../remotion/schema';
import {STYLE_CHOICES, type VideoStyle} from '../remotion/style';
import {
	PRODUCT_PLACEHOLDER,
	fillPrompt,
	promptPlaceholders,
	templateProblems,
	templateSchema,
	type VideoTemplate,
	type VideoTemplateInput,
} from '../shared/templates';
import {ApiError, createTemplate, updateTemplate} from './api';
import {SAMPLE_FORM, toInput} from './form';

const LABELS: Record<string, string> = {
	'photo-blur': 'Blurred photo',
	solid: 'Solid colour',
	gradient: 'Gradient',
	light: 'Light text',
	dark: 'Dark text',
	white: 'White',
	glass: 'Glass',
	'stroke-pop': 'Outlined pop',
	'label-box': 'Label box',
	clean: 'Clean',
	circle: 'Circle',
	burst: 'Starburst',
	tag: 'Tag',
	fast: 'Fast',
	normal: 'Normal',
	slow: 'Slow',
	slide: 'Slide',
	zoom: 'Zoom punch',
	fade: 'Fade',
};

export type EditorSeed = {template: VideoTemplateInput; isNew: boolean};

type Draft = {
	name: string;
	nameTh: string;
	description: string;
	engine: VideoTemplate['engine'];
	style: VideoStyle;
	masterPrompt: string;
	negativePrompt: string;
	/** one choice per line, per placeholder */
	optionsText: Record<string, string>;
	clipSeconds: number;
};

function toDraft(t: VideoTemplateInput): Draft {
	const parsed = templateSchema.parse({...t, id: t.id || 'draft-template'});
	return {
		name: parsed.name,
		nameTh: parsed.nameTh,
		description: parsed.description,
		engine: parsed.engine,
		style: parsed.style,
		masterPrompt: parsed.masterPrompt,
		negativePrompt: parsed.negativePrompt,
		optionsText: Object.fromEntries(Object.entries(parsed.options).map(([k, v]) => [k, v.join('\n')])),
		clipSeconds: parsed.clipSeconds,
	};
}

function fromDraft(d: Draft): VideoTemplateInput {
	const keys = promptPlaceholders(d.masterPrompt).filter((k) => k !== PRODUCT_PLACEHOLDER);
	const options: Record<string, string[]> = {};
	for (const k of keys) {
		const lines = (d.optionsText[k] ?? '')
			.split('\n')
			.map((l) => l.trim())
			.filter(Boolean);
		if (lines.length) options[k] = lines;
	}
	return {
		id: 'draft-template',
		name: d.name,
		nameTh: d.nameTh,
		description: d.description,
		engine: d.engine,
		style: d.style,
		masterPrompt: d.engine === 'clip' ? d.masterPrompt : '',
		negativePrompt: d.engine === 'clip' ? d.negativePrompt : '',
		options,
		clipSeconds: d.clipSeconds,
	};
}

type Props = {
	seed: EditorSeed;
	/** id of the template being edited (undefined for new) */
	editingId?: string;
	onSaved: (t: VideoTemplate) => void;
	onCancel: () => void;
};

export const TemplateEditor: React.FC<Props> = ({seed, editingId, onSaved, onCancel}) => {
	const [draft, setDraft] = useState<Draft>(() => toDraft(seed.template));
	const [saving, setSaving] = useState(false);
	const [serverErrors, setServerErrors] = useState<string[]>([]);

	const setStyle = <K extends keyof VideoStyle>(key: K, value: VideoStyle[K]) => setDraft((d) => ({...d, style: {...d.style, [key]: value}}));
	const candidate = fromDraft(draft);
	const parsed = templateSchema.safeParse(candidate);
	const problems = parsed.success
		? templateProblems(parsed.data)
		: parsed.error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message));
	const placeholders = promptPlaceholders(draft.masterPrompt).filter((k) => k !== PRODUCT_PLACEHOLDER);
	const engine = ENGINES[draft.engine];

	const previewProps = useMemo(
		() => productVideoSchema.parse({...toInput({...SAMPLE_FORM, hook: SAMPLE_FORM.hook}, {engine: draft.engine, style: draft.style})}),
		[draft.engine, draft.style],
	);
	const durationInFrames = engine.durationInFrames(previewProps);

	async function save() {
		if (!parsed.success || problems.length) return;
		setSaving(true);
		setServerErrors([]);
		try {
			const body = {...candidate};
			delete (body as {id?: string}).id;
			const saved = editingId ? await updateTemplate(editingId, body) : await createTemplate(body);
			onSaved(saved);
		} catch (err) {
			setServerErrors(err instanceof ApiError && err.errors.length ? err.errors : [err instanceof Error ? err.message : String(err)]);
		} finally {
			setSaving(false);
		}
	}

	const select = <K extends keyof typeof STYLE_CHOICES>(key: K, label: string) => (
		<label>
			{label}
			<select value={draft.style[key] as string} onChange={(e) => setStyle(key, e.target.value as VideoStyle[K])}>
				{STYLE_CHOICES[key].map((v) => (
					<option key={v} value={v}>
						{LABELS[v] ?? v}
					</option>
				))}
			</select>
		</label>
	);

	return (
		<div className="editor">
			<section className="panel form">
				<div className="editor-head">
					<h2>{seed.isNew ? 'New template' : `Edit · ${seed.template.name}`}</h2>
					<span className={`badge-kind ${draft.engine}${draft.masterPrompt ? ' ai' : ''}`}>{engine.label}</span>
				</div>

				<div className="row">
					<label>
						Name
						<input value={draft.name} maxLength={40} onChange={(e) => setDraft((d) => ({...d, name: e.target.value}))} />
					</label>
					<label>
						Thai name
						<input value={draft.nameTh} maxLength={40} onChange={(e) => setDraft((d) => ({...d, nameTh: e.target.value}))} />
					</label>
				</div>
				<label>
					Description
					<input value={draft.description} maxLength={200} onChange={(e) => setDraft((d) => ({...d, description: e.target.value}))} />
				</label>

				<h2>Look</h2>
				<div className="row wrap">
					<label>
						Button & price colour
						<span className="color-row">
							<select
								value={draft.style.primary === 'platform' ? 'platform' : 'custom'}
								onChange={(e) => setStyle('primary', e.target.value === 'platform' ? 'platform' : '#EE4D2D')}
							>
								<option value="platform">Shopee / Lazada colour</option>
								<option value="custom">Custom</option>
							</select>
							{draft.style.primary !== 'platform' ? (
								<input type="color" value={draft.style.primary} onChange={(e) => setStyle('primary', e.target.value.toUpperCase())} aria-label="Button colour" />
							) : null}
						</span>
					</label>
					<label>
						Sticker & ribbon colour
						<input type="color" value={draft.style.accent} onChange={(e) => setStyle('accent', e.target.value.toUpperCase())} />
					</label>
				</div>
				<div className="row wrap">
					{select('background', 'Background')}
					{draft.style.background !== 'photo-blur' ? (
						<label>
							Colours
							<span className="color-row">
								<input type="color" value={draft.style.bg1} onChange={(e) => setStyle('bg1', e.target.value.toUpperCase())} aria-label="Background colour 1" />
								{draft.style.background === 'gradient' ? (
									<input type="color" value={draft.style.bg2} onChange={(e) => setStyle('bg2', e.target.value.toUpperCase())} aria-label="Background colour 2" />
								) : null}
							</span>
						</label>
					) : null}
					{select('textOnBg', 'Text on background')}
				</div>
				<div className="row wrap">
					{select('card', 'Price card')}
					{select('hook', 'Hook style')}
					{select('sticker', 'Discount sticker')}
				</div>
				<div className="row wrap">
					{select('pace', 'Pace')}
					{draft.engine === 'slideshow' ? select('transition', 'Transition') : null}
					<label>
						Ribbon text
						<input value={draft.style.ribbon} maxLength={20} placeholder="e.g. FLASH SALE" onChange={(e) => setStyle('ribbon', e.target.value)} />
					</label>
				</div>

				{draft.engine === 'clip' ? (
					<>
						<h2>Master prompt (AI)</h2>
						<p className="hint">
							Leave empty for an “upload your own clip” template. Use <code>{'{product}'}</code> for the product, and any{' '}
							<code>{'{name}'}</code> you like for choices people pick (e.g. <code>{'{surface}'}</code>). Write in English and keep
							text and prices out of the prompt: they are added on top.
						</p>
						<label>
							Prompt
							<textarea
								className="prompt"
								rows={6}
								maxLength={2000}
								value={draft.masterPrompt}
								placeholder="Vertical 9:16 product commercial. The {product} from the reference image stays exactly the same. It stands on {surface}. Camera: {motion}."
								onChange={(e) => setDraft((d) => ({...d, masterPrompt: e.target.value}))}
							/>
						</label>
						{placeholders.map((key) => (
							<label key={key}>
								Choices for {`{${key}}`} <small>one per line</small>
								<textarea
									rows={3}
									value={draft.optionsText[key] ?? ''}
									onChange={(e) => setDraft((d) => ({...d, optionsText: {...d.optionsText, [key]: e.target.value}}))}
								/>
							</label>
						))}
						{draft.masterPrompt ? (
							<>
								<label>
									Negative prompt <small>optional, for models that support it</small>
									<input value={draft.negativePrompt} maxLength={500} onChange={(e) => setDraft((d) => ({...d, negativePrompt: e.target.value}))} />
								</label>
								<label>
									Suggested clip length (seconds)
									<input
										inputMode="numeric"
										value={String(draft.clipSeconds)}
										onChange={(e) => setDraft((d) => ({...d, clipSeconds: Number(e.target.value.replace(/\D/g, '')) || 0}))}
									/>
								</label>
								<div className="field">
									<span className="field-label">Example (sample product, first choices)</span>
									<pre className="prompt-example">{fillPrompt(candidate as VideoTemplate, SAMPLE_FORM.productEn)}</pre>
								</div>
							</>
						) : null}
					</>
				) : null}

				{problems.length || serverErrors.length ? (
					<ul className="problems">
						{[...problems, ...serverErrors].map((p, i) => (
							<li key={i}>{p}</li>
						))}
					</ul>
				) : null}

				<div className="button-row editor-actions">
					<button type="button" className="primary" disabled={saving || !parsed.success || problems.length > 0} onClick={() => void save()}>
						{saving ? 'Saving…' : seed.isNew ? 'Create template' : 'Save changes'}
					</button>
					<button type="button" className="secondary" onClick={onCancel}>
						Cancel
					</button>
				</div>
			</section>

			<section className="panel preview sticky">
				<h2>Preview</h2>
				<div className="player-wrap">
					<Player
						component={engine.component}
						inputProps={previewProps}
						durationInFrames={durationInFrames}
						compositionWidth={engine.width}
						compositionHeight={engine.height}
						fps={engine.fps}
						controls
						loop
						autoPlay
						acknowledgeRemotionLicense
						style={{width: '100%', aspectRatio: `${engine.width} / ${engine.height}`}}
					/>
				</div>
				<p className="duration">
					Sample product · {(durationInFrames / engine.fps).toFixed(1)}s{draft.engine === 'clip' ? ' · cover photo stands in for the clip' : ''}
				</p>
			</section>
		</div>
	);
};
