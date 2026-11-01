import type {ProductVideoProps} from '../remotion/schema';

export type Platform = ProductVideoProps['platform'];

/** Guess the marketplace from an affiliate / product link. null = unknown. */
export function detectPlatform(link: string): Platform | null {
	let host: string;
	try {
		host = new URL(link.trim()).hostname.toLowerCase();
	} catch {
		return null;
	}
	if (/(^|\.)shopee\.|(^|\.)shp\.ee$/.test(host)) return 'shopee';
	if (/(^|\.)lazada\.|(^|\.)lzd\.co$/.test(host)) return 'lazada';
	return null;
}

/**
 * Only files this server stores (or ships as samples) may be fed to the renderer.
 * Accepting arbitrary URLs would let anyone make the headless browser fetch any
 * address (SSRF), so absolute URLs are rejected.
 */
export function isAllowedAssetPath(src: string): boolean {
	return /^\/(uploads|samples)\/[A-Za-z0-9._-]+$/.test(src) && !src.includes('..');
}
