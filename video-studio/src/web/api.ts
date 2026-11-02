import type {ProductVideoProps} from '../remotion/schema';
import {RIGHTS} from '../shared/rights';
import type {VideoTemplate, VideoTemplateInput} from '../shared/templates';
import {readStored, writeStored} from './hooks';

export type UploadResult = {
	url: string;
	kind: 'image' | 'audio' | 'video';
	bytes: number;
	durationInSeconds?: number;
	width?: number;
	height?: number;
};

export type JobView = {
	id: string;
	templateId: string;
	templateName: string;
	status: 'queued' | 'rendering' | 'done' | 'failed';
	progress: number;
	queuePosition: number;
	createdAt: string;
	finishedAt?: string;
	videoUrl?: string;
	caption: string;
	error?: string;
	title: string;
	rightsConfirmedAt?: string;
};

export type ServerConfig = {adminKeyRequired: boolean; aiProvider: string};

export class ApiError extends Error {
	constructor(
		message: string,
		public status: number,
		public errors: string[] = [],
	) {
		super(message);
	}
}

async function json<T>(res: Response): Promise<T> {
	if (res.status === 204) return undefined as T;
	const body = await res.json().catch(() => ({}));
	if (!res.ok) {
		const errors: string[] = body.errors ?? [];
		throw new ApiError([body.error, ...errors].filter(Boolean).join('\n') || `Request failed (${res.status})`, res.status, errors);
	}
	return body as T;
}

/** Upload with progress (fetch can't report upload progress, XHR can). */
export function uploadFile(blob: Blob, filename: string, onProgress?: (fraction: number) => void): Promise<UploadResult> {
	return new Promise((resolve, reject) => {
		const form = new FormData();
		form.append('file', blob, filename);
		const xhr = new XMLHttpRequest();
		xhr.open('POST', '/api/uploads');
		xhr.responseType = 'json';
		xhr.upload.onprogress = (e) => {
			if (e.lengthComputable) onProgress?.(e.loaded / e.total);
		};
		xhr.onload = () => {
			const body = xhr.response ?? {};
			if (xhr.status >= 200 && xhr.status < 300) resolve(body as UploadResult);
			else reject(new ApiError(body.error || `Upload failed (${xhr.status})`, xhr.status));
		};
		xhr.onerror = () => reject(new ApiError('Upload failed: network error', 0));
		xhr.send(form);
	});
}

export async function createJob(templateId: string, props: ProductVideoProps, rightsConfirmed: boolean): Promise<JobView> {
	return json(
		await fetch('/api/jobs', {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({templateId, props, rights: {confirmed: rightsConfirmed, version: RIGHTS.version}}),
		}),
	);
}

export async function getJob(id: string): Promise<JobView> {
	return json(await fetch(`/api/jobs/${id}`));
}

export async function listJobs(): Promise<JobView[]> {
	return json(await fetch('/api/jobs'));
}

export async function getConfig(): Promise<ServerConfig> {
	return json(await fetch('/api/config'));
}

export async function listTemplates(): Promise<VideoTemplate[]> {
	return json(await fetch('/api/templates'));
}

/* Template changes may need the admin key (only when the server sets ADMIN_KEY). */

const ADMIN_KEY = 'vs:adminKey';

async function adminFetch<T>(url: string, init: RequestInit): Promise<T> {
	const send = (key: string | null) =>
		fetch(url, {...init, headers: {'Content-Type': 'application/json', ...(key ? {'x-admin-key': key} : {})}});
	let res = await send(readStored<string>(ADMIN_KEY));
	if (res.status === 401) {
		const key = window.prompt('Admin key (set as ADMIN_KEY on the server):');
		if (!key) throw new ApiError('Admin key required to change templates.', 401);
		res = await send(key);
		if (res.ok) writeStored(ADMIN_KEY, key);
	}
	return json<T>(res);
}

export function createTemplate(t: VideoTemplateInput): Promise<VideoTemplate> {
	return adminFetch('/api/templates', {method: 'POST', body: JSON.stringify(t)});
}

export function updateTemplate(id: string, t: VideoTemplateInput): Promise<VideoTemplate> {
	return adminFetch(`/api/templates/${encodeURIComponent(id)}`, {method: 'PUT', body: JSON.stringify(t)});
}

export function deleteTemplate(id: string): Promise<void> {
	return adminFetch(`/api/templates/${encodeURIComponent(id)}`, {method: 'DELETE'});
}
