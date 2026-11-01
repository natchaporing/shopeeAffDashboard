import {useEffect, useState} from 'react';

export function useMediaQuery(query: string): boolean {
	const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
	useEffect(() => {
		const mq = window.matchMedia(query);
		const update = () => setMatches(mq.matches);
		update();
		mq.addEventListener('change', update);
		return () => mq.removeEventListener('change', update);
	}, [query]);
	return matches;
}

// Browser storage can be missing or throw (private mode, blocked site data), so every
// access is guarded and the app works without it.
export function readStored<T>(key: string): T | null {
	try {
		const raw = window.localStorage.getItem(key);
		return raw ? (JSON.parse(raw) as T) : null;
	} catch {
		return null;
	}
}

export function writeStored(key: string, value: unknown): void {
	try {
		if (value === null || value === undefined) window.localStorage.removeItem(key);
		else window.localStorage.setItem(key, JSON.stringify(value));
	} catch {
		// storage unavailable: drafts just won't survive a reload
	}
}
