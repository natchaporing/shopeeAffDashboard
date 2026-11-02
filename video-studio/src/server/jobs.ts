import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {ProductVideoProps} from '../remotion/schema';
import {buildCaption} from '../shared/caption';
import type {RightsRecord} from '../shared/rights';

export type JobStatus = 'queued' | 'rendering' | 'done' | 'failed';

export type Job = {
	id: string;
	templateId: string;
	/** Remotion composition = engine id; older job files without it were slideshows */
	compositionId?: string;
	props: ProductVideoProps;
	status: JobStatus;
	progress: number;
	createdAt: string;
	finishedAt?: string;
	videoUrl?: string;
	caption: string;
	error?: string;
	/** the user's photo-permission confirmation for this video (kept as a record) */
	rights?: RightsRecord;
};

export type RenderFn = (opts: {
	compositionId: string;
	props: ProductVideoProps;
	outputLocation: string;
	onProgress: (p: number) => void;
}) => Promise<void>;

export class QueueFullError extends Error {}

/**
 * Phase 0 job queue: one render at a time, job metadata written to
 * `<dataDir>/jobs/<id>.json` so the video list survives restarts and redeploys.
 * The MVP replaces this with a `render_jobs` table claimed by a separate worker.
 */
export class JobQueue {
	private jobs = new Map<string, Job>();
	private queue: string[] = [];
	private running = false;
	private jobsDir: string;

	constructor(
		private opts: {
			dataDir: string;
			outputDir: string;
			render: RenderFn;
			/** turns `/uploads/a.jpg` into a URL the headless browser can load */
			toAbsolute: (src: string) => string;
			maxQueued: number;
		},
	) {
		this.jobsDir = path.join(opts.dataDir, 'jobs');
		fs.mkdirSync(this.jobsDir, {recursive: true});
		this.load();
	}

	enqueue(templateId: string, compositionId: string, props: ProductVideoProps, rights?: RightsRecord): Job {
		if (this.queue.length >= this.opts.maxQueued) {
			throw new QueueFullError('Too many videos waiting. Try again in a minute.');
		}
		const job: Job = {
			id: crypto.randomUUID(),
			templateId,
			compositionId,
			props,
			status: 'queued',
			progress: 0,
			createdAt: new Date().toISOString(),
			caption: buildCaption(props),
			rights,
		};
		this.jobs.set(job.id, job);
		this.queue.push(job.id);
		this.save(job);
		void this.next();
		return job;
	}

	get(id: string): Job | undefined {
		return this.jobs.get(id);
	}

	list(): Job[] {
		return [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	}

	position(id: string): number {
		return this.queue.indexOf(id);
	}

	/** Forget jobs whose video file was cleaned up. */
	prune(maxAgeMs: number): void {
		const cutoff = Date.now() - maxAgeMs;
		for (const job of this.jobs.values()) {
			if (job.status !== 'queued' && job.status !== 'rendering' && Date.parse(job.createdAt) < cutoff) {
				this.jobs.delete(job.id);
				fs.rmSync(path.join(this.jobsDir, `${job.id}.json`), {force: true});
			}
		}
	}

	private load(): void {
		for (const file of fs.readdirSync(this.jobsDir)) {
			if (!file.endsWith('.json')) continue;
			try {
				const job = JSON.parse(fs.readFileSync(path.join(this.jobsDir, file), 'utf8')) as Job;
				if (job.status === 'queued' || job.status === 'rendering') {
					job.status = 'failed';
					job.error = 'Interrupted by a server restart. Please generate again.';
					this.save(job);
				}
				this.jobs.set(job.id, job);
			} catch (err) {
				console.warn(`skipping unreadable job file ${file}`, err);
			}
		}
	}

	private save(job: Job): void {
		try {
			fs.writeFileSync(path.join(this.jobsDir, `${job.id}.json`), JSON.stringify(job));
		} catch (err) {
			console.error(`could not save job ${job.id}`, err);
		}
	}

	private async next(): Promise<void> {
		if (this.running) return;
		const id = this.queue.shift();
		if (!id) return;
		const job = this.jobs.get(id)!;
		this.running = true;
		job.status = 'rendering';
		this.save(job);
		try {
			const props: ProductVideoProps = {
				...job.props,
				images: job.props.images.map((img) => ({...img, src: this.opts.toAbsolute(img.src)})),
				music: job.props.music ? this.opts.toAbsolute(job.props.music) : undefined,
				clip: job.props.clip ? {...job.props.clip, src: this.opts.toAbsolute(job.props.clip.src)} : undefined,
			};
			const file = `${job.id}.mp4`;
			await this.opts.render({
				compositionId: job.compositionId ?? 'slideshow',
				props,
				outputLocation: path.join(this.opts.outputDir, file),
				onProgress: (p) => {
					job.progress = p;
				},
			});
			job.status = 'done';
			job.progress = 1;
			job.videoUrl = `/outputs/${file}`;
		} catch (err) {
			job.status = 'failed';
			job.error = err instanceof Error ? err.message : String(err);
			console.error(`[job ${job.id}] render failed`, err);
		} finally {
			job.finishedAt = new Date().toISOString();
			this.save(job);
			this.running = false;
			void this.next();
		}
	}
}
