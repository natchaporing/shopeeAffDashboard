import crypto from 'node:crypto';
import path from 'node:path';
import type {ProductVideoProps} from '../remotion/schema';
import {buildCaption} from '../shared/caption';
import {renderVideo} from './render';

export type JobStatus = 'queued' | 'rendering' | 'done' | 'failed';

export type Job = {
	id: string;
	templateId: string;
	props: ProductVideoProps;
	status: JobStatus;
	progress: number;
	createdAt: string;
	finishedAt?: string;
	videoUrl?: string;
	caption: string;
	error?: string;
};

/**
 * Phase 0 job queue: in memory, one render at a time. The MVP replaces this with a
 * `render_jobs` table in Postgres claimed by a separate worker
 * (SELECT ... FOR UPDATE SKIP LOCKED), with the same statuses.
 */
export class JobQueue {
	private jobs = new Map<string, Job>();
	private queue: string[] = [];
	private running = false;

	constructor(
		private outputDir: string,
		/** turns `/uploads/a.jpg` into a URL the headless browser can load */
		private toAbsolute: (src: string) => string,
	) {}

	enqueue(templateId: string, props: ProductVideoProps): Job {
		const job: Job = {
			id: crypto.randomUUID(),
			templateId,
			props,
			status: 'queued',
			progress: 0,
			createdAt: new Date().toISOString(),
			caption: buildCaption(props),
		};
		this.jobs.set(job.id, job);
		this.queue.push(job.id);
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

	private async next(): Promise<void> {
		if (this.running) return;
		const id = this.queue.shift();
		if (!id) return;
		const job = this.jobs.get(id)!;
		this.running = true;
		job.status = 'rendering';
		try {
			const props: ProductVideoProps = {
				...job.props,
				images: job.props.images.map((img) => ({...img, src: this.toAbsolute(img.src)})),
				music: job.props.music ? this.toAbsolute(job.props.music) : undefined,
			};
			const file = `${job.id}.mp4`;
			await renderVideo({
				templateId: job.templateId,
				props,
				outputLocation: path.join(this.outputDir, file),
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
			this.running = false;
			void this.next();
		}
	}
}
