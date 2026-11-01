import React, {useState} from 'react';
import {BUILT_IN_TEMPLATES, type VideoTemplate, type VideoTemplateInput} from '../shared/templates';
import {deleteTemplate} from './api';
import {TemplateEditor, type EditorSeed} from './TemplateEditor';
import {StyleSwatch, templateKind} from './TemplatePicker';

const STARTERS: Array<{label: string; hint: string; template: VideoTemplateInput}> = [
	{
		label: 'New photo slideshow look',
		hint: 'Colours, background, card, hook, sticker, pace',
		template: {...BUILT_IN_TEMPLATES[0], id: '', name: 'My look', nameTh: '', description: '', builtIn: false},
	},
	{
		label: 'New AI template',
		hint: 'Your own master prompt with choices',
		template: {
			id: '',
			name: 'My AI template',
			engine: 'clip',
			description: '',
			style: {hook: 'stroke-pop'},
			masterPrompt:
				'Vertical 9:16 product video. The {product} from the reference image stays exactly the same: same shape, label and colors. It is placed on {surface}. Camera: {motion}. Soft natural light, photorealistic. No added text or logos.',
			options: {surface: ['white marble', 'light wood'], motion: ['slow push-in', 'slow orbit']},
			clipSeconds: 5,
		},
	},
	{
		label: 'New own-clip template',
		hint: 'For your footage: overlay look only',
		template: {id: '', name: 'My clip template', engine: 'clip', description: '', style: {}},
	},
];

type Props = {
	templates: VideoTemplate[];
	onChanged: () => Promise<void> | void;
	onUse: (id: string) => void;
};

export const TemplatesPage: React.FC<Props> = ({templates, onChanged, onUse}) => {
	const [editing, setEditing] = useState<{seed: EditorSeed; id?: string} | null>(null);
	const [error, setError] = useState<string | null>(null);

	function open(seed: EditorSeed, id?: string) {
		setError(null);
		setEditing({seed, id});
		window.scrollTo({top: 0});
	}

	function duplicate(t: VideoTemplate) {
		open({template: {...t, id: '', name: `${t.name} copy`.slice(0, 40), builtIn: false}, isNew: true});
	}

	async function remove(t: VideoTemplate) {
		if (!window.confirm(`Delete the template "${t.name}"? Videos already made are not affected.`)) return;
		setError(null);
		try {
			await deleteTemplate(t.id);
			await onChanged();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	}

	if (editing) {
		return (
			<TemplateEditor
				key={editing.id ?? 'new'}
				seed={editing.seed}
				editingId={editing.id}
				onCancel={() => setEditing(null)}
				onSaved={async () => {
					setEditing(null);
					await onChanged();
				}}
			/>
		);
	}

	return (
		<section className="panel templates-page">
			<h2>New template</h2>
			<div className="starters">
				{STARTERS.map((s) => (
					<button key={s.label} type="button" className="starter" onClick={() => open({template: s.template, isNew: true})}>
						<strong>＋ {s.label}</strong>
						<span>{s.hint}</span>
					</button>
				))}
			</div>

			<h2>All templates</h2>
			{error ? <p className="hint error">{error}</p> : null}
			<ul className="template-list">
				{templates.map((t) => (
					<li key={t.id}>
						<StyleSwatch style={t.style} clip={t.engine === 'clip'} ai={Boolean(t.masterPrompt)} />
						<div className="template-info">
							<strong>{t.name}</strong>
							{t.nameTh ? <span className="th">{t.nameTh}</span> : null}
							<span className="badges">
								<span className={`badge-kind ${t.engine}${t.masterPrompt ? ' ai' : ''}`}>{templateKind(t)}</span>
								<span className={t.builtIn ? 'badge-builtin' : 'badge-custom'}>{t.builtIn ? 'Built-in' : 'Custom'}</span>
							</span>
							{t.description ? <span className="desc">{t.description}</span> : null}
							<div className="template-actions">
								<button type="button" className="small" onClick={() => onUse(t.id)}>
									Use
								</button>
								<button type="button" className="small" onClick={() => duplicate(t)}>
									Duplicate
								</button>
								{t.builtIn ? null : (
									<>
										<button type="button" className="small" onClick={() => open({template: t, isNew: false}, t.id)}>
											Edit
										</button>
										<button type="button" className="small danger" onClick={() => void remove(t)}>
											Delete
										</button>
									</>
								)}
							</div>
						</div>
					</li>
				))}
			</ul>
		</section>
	);
};
