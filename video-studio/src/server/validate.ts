import {z} from 'zod';
import {productVideoSchema, type ProductVideoProps} from '../remotion/schema';
import {getTemplate} from '../remotion/templates/registry';
import {isAllowedAssetPath} from '../shared/links';

const jobRequestSchema = z.object({
	templateId: z.string(),
	props: productVideoSchema,
});

export type ValidJobRequest = {templateId: string; props: ProductVideoProps};

/** Validate a POST /api/jobs body. Returns the parsed request or a list of messages. */
export function validateJobRequest(body: unknown): {ok: true; value: ValidJobRequest} | {ok: false; errors: string[]} {
	const parsed = jobRequestSchema.safeParse(body);
	if (!parsed.success) {
		return {
			ok: false,
			errors: parsed.error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)),
		};
	}
	const {templateId, props} = parsed.data;
	const errors: string[] = [];

	const template = getTemplate(templateId);
	if (!template) errors.push(`Unknown template "${templateId}"`);
	else {
		if (props.images.length < template.minImages) errors.push(`${template.name} needs at least ${template.minImages} image(s)`);
		if (props.images.length > template.maxImages) errors.push(`${template.name} takes at most ${template.maxImages} images`);
	}

	for (const img of props.images) {
		if (!isAllowedAssetPath(img.src)) errors.push(`Image must be an uploaded file: ${img.src}`);
	}
	if (props.music && !isAllowedAssetPath(props.music)) errors.push(`Music must be an uploaded file: ${props.music}`);

	return errors.length ? {ok: false, errors} : {ok: true, value: {templateId, props}};
}
