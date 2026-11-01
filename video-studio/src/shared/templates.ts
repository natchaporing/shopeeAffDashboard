import {z} from 'zod';
import {styleSchema, type VideoStyleInput} from '../remotion/style';

/**
 * A template = engine (code) + style (data) + optional master prompt (data).
 *
 * - engine "slideshow": animates the uploaded photos.
 * - engine "clip": plays a video clip full screen with the hook / price / button on
 *   top. The clip is the user's own footage, or an AI clip made from `masterPrompt`.
 *
 * Built-in templates live here; custom ones are JSON files made in the web app.
 */
export const ENGINE_IDS = ['slideshow', 'clip'] as const;
export type EngineId = (typeof ENGINE_IDS)[number];

const optionKey = z.string().regex(/^[a-z][a-z0-9_]{0,23}$/, 'Option names: lowercase letters, digits, _');

export const templateSchema = z.object({
	id: z.string().regex(/^[a-z0-9][a-z0-9-]{2,47}$/, 'id: 3-48 lowercase letters, digits or -'),
	name: z.string().trim().min(1, 'Name is required').max(40),
	nameTh: z.string().trim().max(40).default(''),
	description: z.string().trim().max(200).default(''),
	engine: z.enum(ENGINE_IDS),
	style: styleSchema.prefault({}),
	/** AI video prompt with {placeholders}; empty = no AI (slideshow, or your own clip) */
	masterPrompt: z.string().trim().max(2000).default(''),
	negativePrompt: z.string().trim().max(500).default(''),
	/** choices for each {placeholder} except {product} */
	options: z.record(optionKey, z.array(z.string().trim().min(1).max(160)).min(1).max(12)).default({}),
	/** suggested AI clip length */
	clipSeconds: z.number().int().min(3).max(15).default(5),
	builtIn: z.boolean().default(false),
});

export type VideoTemplate = z.infer<typeof templateSchema>;
export type VideoTemplateInput = z.input<typeof templateSchema>;

/** {product} is filled from the product form; every other placeholder needs options. */
export const PRODUCT_PLACEHOLDER = 'product';

export function promptPlaceholders(prompt: string): string[] {
	const seen = new Set<string>();
	for (const m of prompt.matchAll(/\{([a-z][a-z0-9_]*)\}/g)) seen.add(m[1]);
	return [...seen];
}

/** Problems that make a template unusable; empty list = OK. */
export function templateProblems(t: VideoTemplate): string[] {
	const problems: string[] = [];
	if (t.engine === 'slideshow' && t.masterPrompt) problems.push('Slideshow templates do not use a master prompt (use the clip engine).');
	if (t.masterPrompt) {
		for (const key of promptPlaceholders(t.masterPrompt)) {
			if (key !== PRODUCT_PLACEHOLDER && !t.options[key]) problems.push(`{${key}} is in the prompt but has no choices.`);
		}
		if (!t.masterPrompt.includes(`{${PRODUCT_PLACEHOLDER}}`)) problems.push('The master prompt should contain {product}.');
	}
	return problems;
}

export type PromptChoices = Record<string, string>;

/** Fill a master prompt: {product} from the form, other placeholders from the chosen options. */
export function fillPrompt(t: Pick<VideoTemplate, 'masterPrompt' | 'options'>, product: string, choices: PromptChoices = {}): string {
	return t.masterPrompt
		.replace(/\{([a-z][a-z0-9_]*)\}/g, (whole, key: string) => {
			if (key === PRODUCT_PLACEHOLDER) return product.trim() || 'the product';
			const options = t.options[key];
			if (!options) return whole;
			return choices[key] && options.includes(choices[key]) ? choices[key] : options[0];
		})
		.replace(/\s+/g, ' ')
		.trim();
}

function builtIn(t: VideoTemplateInput & {style?: VideoStyleInput}): VideoTemplate {
	return templateSchema.parse({...t, builtIn: true});
}

export const BUILT_IN_TEMPLATES: VideoTemplate[] = [
	builtIn({
		id: 'multi-angle-slideshow',
		name: 'Classic Slideshow',
		nameTh: 'สไลด์โชว์คลาสสิก',
		description: 'Blurred-photo background, white price card, slide cuts. Works for anything.',
		engine: 'slideshow',
		style: {},
	}),
	builtIn({
		id: 'flash-sale',
		name: 'Flash Sale',
		nameTh: 'แฟลชเซล',
		description: 'Red-hot gradient, yellow hook box, starburst sticker, fast zoom cuts.',
		engine: 'slideshow',
		style: {
			primary: '#E8112D',
			accent: '#FFD400',
			background: 'gradient',
			bg1: '#6E000E',
			bg2: '#FF3D00',
			textOnBg: 'light',
			card: 'white',
			hook: 'label-box',
			sticker: 'burst',
			pace: 'fast',
			transition: 'zoom',
			ribbon: 'FLASH SALE',
		},
	}),
	builtIn({
		id: 'minimal-beauty',
		name: 'Minimal Beauty',
		nameTh: 'มินิมอลบิวตี้',
		description: 'Soft cream background, dusty-rose accents, slow fades. Skincare & beauty.',
		engine: 'slideshow',
		style: {
			primary: '#9E6B74',
			accent: '#E5989B',
			background: 'solid',
			bg1: '#F8EDEB',
			bg2: '#F8EDEB',
			textOnBg: 'dark',
			card: 'white',
			hook: 'clean',
			sticker: 'tag',
			pace: 'slow',
			transition: 'fade',
			ribbon: '',
		},
	}),
	builtIn({
		id: 'gadget-dark',
		name: 'Gadget Dark',
		nameTh: 'แกดเจ็ตโทนมืด',
		description: 'Deep navy, neon cyan, glass card, punchy zooms. Tech & gadgets.',
		engine: 'slideshow',
		style: {
			primary: '#00E5FF',
			accent: '#7C4DFF',
			background: 'gradient',
			bg1: '#05070D',
			bg2: '#132042',
			textOnBg: 'light',
			card: 'glass',
			hook: 'clean',
			sticker: 'tag',
			pace: 'normal',
			transition: 'zoom',
			ribbon: '',
		},
	}),
	builtIn({
		id: 'ai-hero-shot',
		name: 'AI Hero Shot',
		nameTh: 'AI ช็อตฮีโร่',
		description: 'AI studio shot of your product (surface, setting, camera move), with price and button on top.',
		engine: 'clip',
		style: {hook: 'stroke-pop'},
		masterPrompt:
			'Vertical 9:16 premium product commercial. The {product} from the reference image stays exactly the same: same shape, label, text and colors. It stands on {surface} in {setting}. Camera: {motion}. {lighting}, shallow depth of field, crisp focus on the product, photorealistic. No added text, captions or logos.',
		negativePrompt: 'distorted label, changed packaging, extra products, text, watermark, blurry product',
		options: {
			surface: ['white marble', 'wet black stone', 'light oak wood', 'a round pastel podium'],
			setting: ['a minimal studio with a soft gradient backdrop', 'a bright bathroom with plants', 'a sunlit kitchen counter', 'a dark studio with rim light'],
			motion: ['slow push-in', 'slow 180° orbit around the product', 'gentle top-down tilt to eye level', 'water droplets splashing around the product in slow motion'],
			lighting: ['Soft diffused daylight', 'Warm golden-hour sunlight', 'High-contrast studio light'],
		},
		clipSeconds: 5,
	}),
	builtIn({
		id: 'ai-lifestyle',
		name: 'AI Lifestyle',
		nameTh: 'AI ไลฟ์สไตล์',
		description: 'AI scene of your product in everyday life, with price and button on top.',
		engine: 'clip',
		style: {hook: 'clean', card: 'white'},
		masterPrompt:
			'Vertical 9:16 lifestyle video. The {product} from the reference image stays exactly the same (shape, label, colors) and is the clear hero of the shot, placed in {scene}. {action}. Natural {time} light, realistic textures, slow handheld camera, shallow depth of field. No text, captions or extra logos.',
		negativePrompt: 'changed packaging, distorted label, faces in focus, text, watermark',
		options: {
			scene: ['a cozy Thai condo living room', 'a bright modern bathroom counter', 'a café table by the window', 'a tidy office desk next to a laptop'],
			action: ['Soft curtains move in the breeze', 'Steam rises from a coffee cup in the background', 'A hand gently reaches for the product'],
			time: ['morning', 'golden-hour', 'evening'],
		},
		clipSeconds: 5,
	}),
	builtIn({
		id: 'own-clip',
		name: 'Your Own Clip',
		nameTh: 'คลิปของคุณเอง',
		description: 'Upload your own footage (unboxing, try-on, demo); we add hook, price and button.',
		engine: 'clip',
		style: {},
	}),
];
