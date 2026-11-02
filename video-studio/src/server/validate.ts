import {z} from 'zod';
import {ENGINES} from '../remotion/engines';
import {productVideoSchema, type ProductVideoProps} from '../remotion/schema';
import {isAllowedAssetPath} from '../shared/links';
import {RIGHTS, type RightsRecord} from '../shared/rights';
import type {VideoTemplate} from '../shared/templates';
import type {VideoInfo} from './media';

const jobRequestSchema = z.object({
	templateId: z.string(),
	props: z.unknown(),
	rights: z.object({confirmed: z.boolean(), version: z.string()}).optional(),
});

export type ValidJobRequest = {templateId: string; compositionId: string; props: ProductVideoProps; rights: RightsRecord};

export type JobDeps = {
	getTemplate: (id: string) => VideoTemplate | undefined;
	/** what the server measured when the clip was uploaded */
	clipInfo: (src: string) => VideoInfo | undefined;
};

/**
 * Validate a POST /api/jobs body. The template decides the engine and the style (the
 * client cannot send its own style), and clip timing comes from the server's own
 * measurement of the uploaded file.
 */
export function validateJobRequest(body: unknown, deps: JobDeps): {ok: true; value: ValidJobRequest} | {ok: false; errors: string[]} {
	const outer = jobRequestSchema.safeParse(body);
	if (!outer.success) return {ok: false, errors: ['Body must be {templateId, props}']};

	const template = deps.getTemplate(outer.data.templateId);
	if (!template) return {ok: false, errors: [`Unknown template "${outer.data.templateId}"`]};
	const engine = ENGINES[template.engine];

	const rawProps = outer.data.props && typeof outer.data.props === 'object' ? (outer.data.props as Record<string, unknown>) : {};
	const parsed = productVideoSchema.safeParse({...rawProps, style: template.style, clip: engine.usesClip ? rawProps.clip : undefined});
	if (!parsed.success) {
		return {
			ok: false,
			errors: parsed.error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)),
		};
	}
	const props = parsed.data;
	const errors: string[] = [];

	// The user must confirm they may use these photos / clips (seller photos belong to the shop).
	const rights = outer.data.rights;
	if (!rights?.confirmed) errors.push('Tick the photo permission box: confirm you took these photos yourself or have the owner’s permission.');
	else if (rights.version !== RIGHTS.version) errors.push('The photo permission text has changed. Please tick the box again.');

	if (props.images.length < engine.minImages) errors.push(`${template.name} needs at least ${engine.minImages} photo(s)`);
	if (props.images.length > engine.maxImages) errors.push(`${template.name} takes at most ${engine.maxImages} photos`);
	for (const img of props.images) {
		if (!isAllowedAssetPath(img.src)) errors.push(`Image must be an uploaded file: ${img.src}`);
	}
	if (props.music && !isAllowedAssetPath(props.music)) errors.push(`Music must be an uploaded file: ${props.music}`);

	if (engine.usesClip) {
		if (!props.clip) errors.push(template.masterPrompt ? 'Upload the AI clip first (make it with the prompt, then upload it).' : 'Upload your video clip first.');
		else if (!isAllowedAssetPath(props.clip.src)) errors.push(`Clip must be an uploaded file: ${props.clip.src}`);
		else {
			const info = deps.clipInfo(props.clip.src);
			if (!info) errors.push('Clip not found on the server. Upload it again.');
			else props.clip = {...props.clip, ...info};
		}
	}

	if (errors.length) return {ok: false, errors};
	return {
		ok: true,
		value: {
			templateId: template.id,
			compositionId: engine.id,
			props,
			rights: {confirmed: true, version: RIGHTS.version, statement: RIGHTS.statement, confirmedAt: new Date().toISOString()},
		},
	};
}
