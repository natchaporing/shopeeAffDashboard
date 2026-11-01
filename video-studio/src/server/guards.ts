import fs from 'node:fs';
import path from 'node:path';
import type {RequestHandler} from 'express';

/**
 * Fixed-window rate limit per client IP. In memory, so it resets on restart; good
 * enough to stop a stray script from filling the disk while there is no login.
 */
export function rateLimit(opts: {windowMs: number; max: number; message: string}): RequestHandler {
	const hits = new Map<string, {count: number; resetAt: number}>();
	return (req, res, next) => {
		const now = Date.now();
		const key = req.ip ?? 'unknown';
		let entry = hits.get(key);
		if (!entry || entry.resetAt <= now) {
			entry = {count: 0, resetAt: now + opts.windowMs};
			hits.set(key, entry);
		}
		entry.count++;
		if (hits.size > 10_000) {
			for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
		}
		if (entry.count > opts.max) {
			res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
			res.status(429).json({error: opts.message});
			return;
		}
		next();
	};
}

/** Delete files older than maxAgeMs from the given directories. Returns how many were removed. */
export function deleteOldFiles(dirs: string[], maxAgeMs: number, now = Date.now()): number {
	let removed = 0;
	for (const dir of dirs) {
		let names: string[];
		try {
			names = fs.readdirSync(dir);
		} catch {
			continue;
		}
		for (const name of names) {
			const file = path.join(dir, name);
			try {
				const stat = fs.statSync(file);
				if (stat.isFile() && now - stat.mtimeMs > maxAgeMs) {
					fs.rmSync(file, {force: true});
					removed++;
				}
			} catch {
				// file vanished between readdir and stat
			}
		}
	}
	return removed;
}
