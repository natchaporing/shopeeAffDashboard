import {Player} from '@remotion/player';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import type {z} from 'zod';
import {ENGINES} from '../remotion/engines';
import {productVideoSchema, type ProductVideoProps} from '../remotion/schema';
import {buildCaption} from '../shared/caption';
import {BUILT_IN_TEMPLATES, type VideoTemplate} from '../shared/templates';
import {createJob, getJob, listJobs, listTemplates, type JobView} from './api';
import {EMPTY_FORM, SAMPLE_FORM, reviveForm, rightsConfirmed, toInput, type Form} from './form';
import {readStored, useMediaQuery, writeStored} from './hooks';
import {JobResult} from './JobResult';
import {ProductForm} from './ProductForm';
import {TemplatesPage} from './TemplatesPage';

const DRAFT_KEY = 'vs:draft:v1';
const JOB_KEY = 'vs:job:v1';

type Page = 'create' | 'templates';

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

function pageFromHash(): Page {
	return typeof window !== 'undefined' && window.location.hash === '#templates' ? 'templates' : 'create';
}

export const App: React.FC = () => {
	const isPhone = useMediaQuery('(max-width: 699px)');
	const [page, setPage] = useState<Page>(pageFromHash);
	const [templates, setTemplates] = useState<VideoTemplate[]>(BUILT_IN_TEMPLATES);
	const [form, setForm] = useState<Form>(() => reviveForm(readStored(DRAFT_KEY)));
	const [job, setJob] = useState<JobView | null>(null);
	// Read before the first effects run: the effect that stores job?.id clears it on mount.
	const [savedJobId] = useState(() => readStored<string>(JOB_KEY));
	const [history, setHistory] = useState<JobView[]>([]);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [view, setView] = useState<'edit' | 'preview'>('edit');

	const template = templates.find((t) => t.id === form.templateId) ?? templates[0];
	const engine = ENGINES[template.engine];
	const parsed = useMemo(() => productVideoSchema.safeParse(toInput(form, template)), [form, template]);
	const props: ProductVideoProps | null = parsed.success ? parsed.data : null;
	const problems = parsed.success ? [] : friendlyIssues(parsed.error);
	if (props && engine.usesClip && !props.clip) problems.push(template.masterPrompt ? 'Upload the AI clip' : 'Upload your clip');
	if (props && !rightsConfirmed(form)) problems.push('Tick the photo permission box (under Photos)');
	const canGenerate = Boolean(props) && problems.length === 0;
	const rendering = job?.status === 'queued' || job?.status === 'rendering';

	const refreshTemplates = useCallback(async () => {
		try {
			setTemplates(await listTemplates());
		} catch {
			// offline / server down: keep the built-ins
		}
	}, []);

	// Keep the draft and the active job across reloads / app switches.
	useEffect(() => writeStored(DRAFT_KEY, form), [form]);
	useEffect(() => writeStored(JOB_KEY, job?.id ?? null), [job?.id]);

	useEffect(() => {
		refreshHistory();
		void refreshTemplates();
		if (savedJobId) getJob(savedJobId).then(setJob).catch(() => undefined);
		const onHash = () => setPage(pageFromHash());
		window.addEventListener('hashchange', onHash);
		return () => window.removeEventListener('hashchange', onHash);
	}, [savedJobId, refreshTemplates]);

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

	function goPage(next: Page) {
		window.location.hash = next === 'templates' ? 'templates' : '';
		setPage(next);
		window.scrollTo({top: 0});
	}

	function go(next: 'edit' | 'preview') {
		setView(next);
		window.scrollTo({top: 0});
	}

	async function submit() {
		if (!props || !canGenerate) return;
		setSubmitError(null);
		try {
			setJob(await createJob(template.id, props, rightsConfirmed(form)));
			refreshHistory();
		} catch (err) {
			setSubmitError(err instanceof Error ? err.message : String(err));
		}
	}

	function startNew() {
		if (!window.confirm('Start a new video? The current form will be cleared.')) return;
		setForm({...EMPTY_FORM, templateId: form.templateId});
		setJob(null);
		setSubmitError(null);
		go('edit');
	}

	const header = (
		<header>
			<h1>Video Studio</h1>
			<nav className="page-nav" aria-label="Pages">
				<button type="button" aria-current={page === 'create' ? 'page' : undefined} onClick={() => goPage('create')}>
					Create
				</button>
				<button type="button" aria-current={page === 'templates' ? 'page' : undefined} onClick={() => goPage('templates')}>
					Templates
				</button>
			</nav>
			{page === 'create' ? (
				<div className="header-actions">
					<button type="button" className="small" onClick={() => setForm({...SAMPLE_FORM, templateId: form.templateId})}>
						Sample
					</button>
					<button type="button" className="small" onClick={startNew}>
						New
					</button>
				</div>
			) : null}
		</header>
	);

	if (page === 'templates') {
		return (
			<div className={`app${isPhone ? ' phone no-bar' : ''}`}>
				{header}
				<TemplatesPage
					templates={templates}
					onChanged={refreshTemplates}
					onUse={(id) => {
						setForm((f) => ({...f, templateId: id}));
						goPage('create');
						go('edit');
					}}
				/>
			</div>
		);
	}

	const preview = (
		<PreviewPanel
			template={template}
			props={props}
			problems={problems}
			canGenerate={canGenerate}
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
	const formPanel = <ProductForm form={form} setForm={setForm} template={template} templates={templates} />;

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
					{view === 'edit' ? <section className="panel form">{formPanel}</section> : <section className="panel preview">{preview}</section>}
				</main>
				<div className="bottombar">
					{view === 'edit' ? (
						<>
							<span className="summary">
								{issues ? `${issues} thing${issues > 1 ? 's' : ''} to fill` : `${template.name} · ready`}
							</span>
							<button type="button" className="primary" onClick={() => go('preview')}>
								Preview →
							</button>
						</>
					) : !canGenerate ? (
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
				<section className="panel form">{formPanel}</section>
				<section className="panel preview sticky">{preview}</section>
			</main>
		</div>
	);
};

type PreviewProps = {
	template: VideoTemplate;
	props: ProductVideoProps | null;
	problems: string[];
	canGenerate: boolean;
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
	canGenerate,
	job,
	history,
	submitError,
	showGenerate,
	rendering,
	onSubmit,
	onOpenJob,
}) => {
	const engine = ENGINES[template.engine];
	const durationInFrames = props ? engine.durationInFrames(props) : 1;
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
						component={engine.component}
						inputProps={props}
						durationInFrames={durationInFrames}
						compositionWidth={engine.width}
						compositionHeight={engine.height}
						fps={engine.fps}
						controls
						loop
						autoPlay={!finished}
						clickToPlay
						acknowledgeRemotionLicense
						style={{width: '100%', aspectRatio: `${engine.width} / ${engine.height}`}}
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
					{template.name} · {(durationInFrames / engine.fps).toFixed(1)}s · {engine.width}×{engine.height}
				</p>
			) : null}
			{props && problems.length ? <p className="hint warn center">{problems.join(' · ')}</p> : null}

			{showGenerate ? (
				<button type="button" className="primary" disabled={!canGenerate || rendering} onClick={onSubmit}>
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
