import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {BUILT_IN_TEMPLATES, templateProblems, templateSchema, type VideoTemplate} from '../shared/templates';

export class TemplateError extends Error {
	constructor(
		message: string,
		public status = 400,
		public problems: string[] = [],
	) {
		super(message);
	}
}

export function slugify(name: string): string {
	const base = name
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 36);
	return `${base.length >= 3 ? base : 'template'}-${crypto.randomBytes(3).toString('hex')}`;
}

/**
 * Built-in templates (code) + custom templates (one JSON file each in
 * `<dataDir>/templates`). Built-ins can be duplicated but not changed or deleted.
 */
export class TemplateStore {
	private dir: string;
	private custom = new Map<string, VideoTemplate>();

	constructor(dataDir: string) {
		this.dir = path.join(dataDir, 'templates');
		fs.mkdirSync(this.dir, {recursive: true});
		for (const file of fs.readdirSync(this.dir)) {
			if (!file.endsWith('.json')) continue;
			try {
				const t = templateSchema.parse({...JSON.parse(fs.readFileSync(path.join(this.dir, file), 'utf8')), builtIn: false});
				if (!BUILT_IN_TEMPLATES.some((b) => b.id === t.id)) this.custom.set(t.id, t);
			} catch (err) {
				console.warn(`skipping invalid template file ${file}`, err);
			}
		}
	}

	list(): VideoTemplate[] {
		const custom = [...this.custom.values()].sort((a, b) => a.name.localeCompare(b.name));
		return [...BUILT_IN_TEMPLATES, ...custom];
	}

	get(id: string): VideoTemplate | undefined {
		return BUILT_IN_TEMPLATES.find((t) => t.id === id) ?? this.custom.get(id);
	}

	create(input: unknown): VideoTemplate {
		const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
		const id = typeof raw.id === 'string' && raw.id ? raw.id : slugify(String(raw.name ?? ''));
		if (this.get(id)) throw new TemplateError(`A template with id "${id}" already exists`, 409);
		return this.write({...raw, id});
	}

	update(id: string, input: unknown): VideoTemplate {
		const existing = this.get(id);
		if (!existing) throw new TemplateError('Template not found', 404);
		if (existing.builtIn) throw new TemplateError('Built-in templates cannot be changed. Duplicate it instead.', 403);
		const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
		// the engine decides which fields make sense, so it can't change after creation
		return this.write({...raw, id, engine: existing.engine});
	}

	delete(id: string): void {
		const existing = this.get(id);
		if (!existing) throw new TemplateError('Template not found', 404);
		if (existing.builtIn) throw new TemplateError('Built-in templates cannot be deleted.', 403);
		this.custom.delete(id);
		fs.rmSync(path.join(this.dir, `${id}.json`), {force: true});
	}

	private write(raw: Record<string, unknown>): VideoTemplate {
		const parsed = templateSchema.safeParse({...raw, builtIn: false});
		if (!parsed.success) {
			const problems = parsed.error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message));
			throw new TemplateError('Template is not valid', 400, problems);
		}
		const problems = templateProblems(parsed.data);
		if (problems.length) throw new TemplateError('Template is not valid', 400, problems);
		const t = parsed.data;
		fs.writeFileSync(path.join(this.dir, `${t.id}.json`), JSON.stringify(t, null, 2));
		this.custom.set(t.id, t);
		return t;
	}
}
