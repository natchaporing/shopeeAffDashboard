import {Player} from '@remotion/player';
import React, {useEffect, useMemo, useState} from 'react';
import type {z} from 'zod';
import {productVideoSchema, type ProductVideoProps} from '../remotion/schema';
import {TEMPLATES, getTemplate, type TemplateManifest} from '../remotion/templates/registry';
import {buildCaption} from '../shared/caption';
import {createJob, getJob, listJobs, type JobView} from './api';
import {EMPTY_FORM, SAMPLE_FORM, reviveForm, toInput, type Form} from './form';
import {readStored, useMediaQuery, writeStored} from './hooks';
import {JobResult} from './JobResult';
import {ProductForm} from './ProductForm';

const DRAFT_KEY = 'vs:draft:v1';
const JOB_KEY = 'vs:job:v1';

const FIELD_LABELS: Record<string, string> = {
	title: 'Product name',
	price: 'Price',
	originalPrice: 'Original price',
	rating: 'Rating (0–5)',
	sold: 'Sold',
	images: 'Photos',
	hook: 'Hook',
	cta: 'Button text',
	ctaSub: 'Text under the button',
};

function friendlyIssues(error: z.ZodError): string[] {
	return error.issues.map((issue) => {
		const field = String(issue.path[0] ?? '');
		const label = FIELD_LABELS[field];
		if (issue.message.startsWith('Invalid') || issue.message.startsWith('Too')) {
			return label ? `${label}: check this value` : issue.message;
		}
		return issue.message;
	});
}

export const App: React.FC = () => {
	const isPhone = useMediaQuery('(max-width: 699px)');
	const [form, setForm] = useState<Form>(() => reviveForm(readStored(DRAFT_KEY)));
	const [job, setJob] = useState<JobView | null>(null);
	// Read before the first effects run: the effect that stores job?.id clears it on mount.
	const [savedJobId] = useState(() => readStored<string>(JOB_KEY));
	const [history, setHistory] = useState<JobView[]>([]);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [view, setView] = useState<'edit' | 'preview'>('edit');

	const template = getTemplate(form.templateId) ?? TEMPLATES[0];
	const parsed = useMemo(() => productVideoSchema.safeParse(toInput(form)), [form]);
	const props: ProductVideoProps | null = parsed.success ? parsed.data : null;
	const problems = parsed.success ? [] : friendlyIssues(parsed.error);
	const rendering = job?.status === 'queued' || job?.status === 'rendering';

	// Keep the draft and the active job across reloads / app switches.
	useEffect(() => writeStored(DRAFT_KEY, form), [form]);
	useEffect(() => writeStored(JOB_KEY, job?.id ?? null), [job?.id]);

	useEffect(() => {
		refreshHistory();
		if (savedJobId) getJob(savedJobId).then(setJob).catch(() => undefined);
	}, []);

	// Poll the active job until it finishes.
	useEffect(() => {
		if (!job || !rendering) return;
		const t = setTimeout(async () => {
			try {
				const next = await getJob(job.id);
				setJob(next);
				if (next.status === 'done' || next.status === 'failed') refreshHistory();
			} catch (err) {
				setSubmitError(err instanceof Error ? err.message : String(err));
			}
		}, 1000);
		return () => clearTimeout(t);
	}, [job, rendering]);

	function refreshHistory() {
		listJobs().then(setHistory).catch(() => undefined);
	}

	function go(next: 'edit' | 'preview') {
		setView(next);
		window.scrollTo({top: 0});
	}

	async function submit() {
		if (!props) return;
		setSubmitError(null);
		try {
			setJob(await createJob(template.id, props));
			refreshHistory();
		} catch (err) {
			setSubmitError(err instanceof Error ? err.message : String(err));
		}
	}

	function startNew() {
		if (form !== EMPTY_FORM && !window.confirm('Start a new video? The current form will be cleared.')) return;
		setForm(EMPTY_FORM);
		setJob(null);
		setSubmitError(null);
		go('edit');
	}

	const header = (
		<header>
			<h1>Video Studio</h1>
			<span className="tag">Phase 0</span>
			<div className="header-actions">
				<button type="button" className="small" onClick={() => setForm(SAMPLE_FORM)}>
					Sample
				</button>
				<button type="button" className="small" onClick={startNew}>
					New
				</button>
			</div>
		</header>
	);

	const preview = (
		<PreviewPanel
			template={template}
			props={props}
			problems={problems}
			job={job}
			history={history}
			submitError={submitError}
			showGenerate={!isPhone}
			rendering={rendering}
			onSubmit={() => void submit()}
			onOpenJob={(j) => {
				setJob(j);
				window.scrollTo({top: 0, behavior: 'smooth'});
			}}
		/>
	);

	if (isPhone) {
		const issues = problems.length;
		return (
			<div className="app phone">
				{header}
				<div className="tabs" role="tablist">
					<button type="button" role="tab" aria-selected={view === 'edit'} onClick={() => go('edit')}>
						1 · Edit
					</button>
					<button type="button" role="tab" aria-selected={view === 'preview'} onClick={() => go('preview')}>
						2 · Preview{rendering ? ` · ${Math.round((job?.progress ?? 0) * 100)}%` : ''}
					</button>
				</div>
				<main>
					{view === 'edit' ? (
						<section className="panel form">
							<ProductForm form={form} setForm={setForm} template={template} />
						</section>
					) : (
						<section className="panel preview">{preview}</section>
					)}
				</main>
				<div className="bottombar">
					{view === 'edit' ? (
						<>
							<span className="summary">
								{issues ? `${issues} thing${issues > 1 ? 's' : ''} to fill` : `${form.images.length} photo${form.images.length === 1 ? '' : 's'} · ready`}
							</span>
							<button type="button" className="primary" onClick={() => go('preview')}>
								Preview →
							</button>
						</>
					) : !props ? (
						<button type="button" className="primary wide" onClick={() => go('edit')}>
							← Fill {issues} thing{issues > 1 ? 's' : ''} in Edit
						</button>
					) : (
						<button type="button" className="primary wide" disabled={rendering} onClick={() => void submit()}>
							{rendering ? `Rendering ${Math.round((job?.progress ?? 0) * 100)}%…` : 'Generate video'}
						</button>
					)}
				</div>
			</div>
		);
	}

	return (
		<div className="app">
			{header}
			<main className="columns">
				<section className="panel form">
					<ProductForm form={form} setForm={setForm} template={template} />
				</section>
				<section className="panel preview sticky">{preview}</section>
			</main>
		</div>
	);
};

type PreviewProps = {
	template: TemplateManifest;
	props: ProductVideoProps | null;
	problems: string[];
	job: JobView | null;
	history: JobView[];
	submitError: string | null;
	showGenerate: boolean;
	rendering: boolean;
	onSubmit: () => void;
	onOpenJob: (job: JobView) => void;
};

const PreviewPanel: React.FC<PreviewProps> = ({
	template,
	props,
	problems,
	job,
	history,
	submitError,
	showGenerate,
	rendering,
	onSubmit,
	onOpenJob,
}) => {
	const durationInFrames = props ? template.durationInFrames(props) : 1;
	const finished = job && (job.status === 'done' || job.status === 'failed');

	return (
		<>
			{finished ? (
				<div className="result-head">
					<h2>Your video</h2>
				</div>
			) : null}
			{finished ? <JobResult job={job} /> : null}

			{finished ? <h2 className="preview-title">Preview of current form</h2> : null}
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
						autoPlay={!finished}
						clickToPlay
						acknowledgeRemotionLicense
						style={{width: '100%', aspectRatio: `${template.width} / ${template.height}`}}
					/>
				) : (
					<div className="placeholder">
						<p>The live preview appears here</p>
						<ul>
							{problems.map((p, i) => (
								<li key={i}>{p}</li>
							))}
						</ul>
					</div>
				)}
			</div>
			{props ? (
				<p className="duration">
					{(durationInFrames / template.fps).toFixed(1)}s · {template.width}×{template.height} · {template.fps}fps
				</p>
			) : null}

			{showGenerate ? (
				<button type="button" className="primary" disabled={!props || rendering} onClick={onSubmit}>
					{rendering ? 'Rendering…' : 'Generate video'}
				</button>
			) : null}
			{submitError ? <p className="hint error">{submitError}</p> : null}

			{job && rendering ? (
				<div className="job">
					<div className="progress" role="progressbar" aria-valuenow={Math.round(job.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
						<div style={{width: `${Math.round(job.progress * 100)}%`}} />
					</div>
					<p className="hint">
						{job.status === 'queued'
							? `Waiting in line (position ${job.queuePosition})…`
							: `Rendering ${Math.round(job.progress * 100)}%. You can switch apps; it keeps going.`}
					</p>
				</div>
			) : null}

			{props && !job ? (
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
								<button type="button" className="history-item" onClick={() => onOpenJob(h)} aria-current={job?.id === h.id}>
									<span className={`status ${h.status}`}>{h.status}</span>
									<span className="title">{h.title}</span>
									<span className="when">{new Date(h.createdAt).toLocaleString('th-TH', {dateStyle: 'short', timeStyle: 'short'})}</span>
								</button>
							</li>
						))}
					</ul>
				</div>
			) : null}
		</>
	);
};
