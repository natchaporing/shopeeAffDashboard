import type {ProductVideoProps} from '../remotion/schema';

export type UploadResult = {url: string; kind: 'image' | 'audio'; bytes: number};

export type JobView = {
	id: string;
	templateId: string;
	status: 'queued' | 'rendering' | 'done' | 'failed';
	progress: number;
	queuePosition: number;
	createdAt: string;
	finishedAt?: string;
	videoUrl?: string;
	caption: string;
	error?: string;
	title: string;
};

async function json<T>(res: Response): Promise<T> {
	const body = await res.json().catch(() => ({}));
	if (!res.ok) {
		const msg = body.errors?.join('\n') || body.error || `Request failed (${res.status})`;
		throw new Error(msg);
	}
	return body as T;
}

export async function uploadFile(blob: Blob, filename: string): Promise<UploadResult> {
	const form = new FormData();
	form.append('file', blob, filename);
	return json(await fetch('/api/uploads', {method: 'POST', body: form}));
}

export async function createJob(templateId: string, props: ProductVideoProps): Promise<JobView> {
	return json(
		await fetch('/api/jobs', {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({templateId, props}),
		}),
	);
}

export async function getJob(id: string): Promise<JobView> {
	return json(await fetch(`/api/jobs/${id}`));
}

export async function listJobs(): Promise<JobView[]> {
	return json(await fetch('/api/jobs'));
}
