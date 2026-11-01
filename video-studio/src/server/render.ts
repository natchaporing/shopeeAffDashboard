import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import type {ProductVideoProps} from '../remotion/schema';

export const ROOT = path.resolve(import.meta.dirname, '../..');
const ENTRY = path.join(ROOT, 'src/remotion/index.ts');
const PUBLIC_DIR = path.join(ROOT, 'public');

/**
 * Optional path to a Chrome / chrome-headless-shell binary. Leave unset and Remotion
 * downloads its own headless shell on first render.
 */
const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;

let bundlePromise: Promise<string> | null = null;

/** Bundle the Remotion project once per process (≈10-20s); reused for every render. */
export function getServeUrl(force = false): Promise<string> {
	if (!bundlePromise || force) {
		bundlePromise = bundle({entryPoint: ENTRY, publicDir: PUBLIC_DIR}).catch((err) => {
			bundlePromise = null;
			throw err;
		});
	}
	return bundlePromise;
}

export type RenderOptions = {
	templateId: string;
	props: ProductVideoProps;
	outputLocation: string;
	onProgress?: (progress: number) => void;
};

export async function renderVideo({templateId, props, outputLocation, onProgress}: RenderOptions): Promise<void> {
	const serveUrl = await getServeUrl(process.env.REBUNDLE === '1');
	const composition = await selectComposition({serveUrl, id: templateId, inputProps: props, browserExecutable});
	await renderMedia({
		serveUrl,
		composition,
		inputProps: props,
		codec: 'h264',
		crf: 20,
		outputLocation,
		browserExecutable,
		overwrite: true,
		onProgress: ({progress}) => onProgress?.(progress),
	});
}

/** Single frame as PNG; used by the sample script and for thumbnails. */
export async function renderFrame(opts: {templateId: string; props: ProductVideoProps; frame: number; output: string}): Promise<void> {
	const serveUrl = await getServeUrl();
	const composition = await selectComposition({serveUrl, id: opts.templateId, inputProps: opts.props, browserExecutable});
	await renderStill({
		serveUrl,
		composition,
		inputProps: opts.props,
		frame: opts.frame,
		output: opts.output,
		browserExecutable,
		overwrite: true,
	});
}
