import {z} from 'zod';
import {styleSchema} from './style';

/**
 * Props for every product video. The web form, the live preview, the render server
 * and the tests all validate against this one schema.
 *
 * Image / audio / clip fields are URLs. In the browser they are relative
 * (`/uploads/x.jpg`); the render server turns them into absolute URLs the headless
 * browser can load. `style` comes from the chosen template (the server injects it).
 */
export const imageSchema = z.object({
	src: z.string().min(1),
	width: z.number().int().positive().optional(),
	height: z.number().int().positive().optional(),
});

export const MAX_CLIP_SECONDS = 20;

export const clipSchema = z.object({
	src: z.string().min(1),
	durationInSeconds: z.number().positive().max(600),
	width: z.number().int().positive().optional(),
	height: z.number().int().positive().optional(),
	/** keep the clip's own sound (e.g. your voice in an unboxing) */
	keepAudio: z.boolean().default(true),
});

export const productVideoSchema = z.object({
	platform: z.enum(['shopee', 'lazada']),
	affiliateLink: z.string().trim().max(500).default(''),
	title: z.string().trim().min(1, 'Product name is required').max(120),
	hook: z.string().trim().max(40).default(''),
	price: z.number().positive('Price must be > 0'),
	originalPrice: z.number().positive().optional(),
	rating: z.number().min(0).max(5).optional(),
	sold: z.number().int().min(0).optional(),
	hidePrice: z.boolean().default(false),
	cta: z.string().trim().max(32).default('กดตะกร้าเลย'),
	ctaSub: z.string().trim().max(40).default('ลิงก์อยู่ในไบโอ'),
	images: z.array(imageSchema).min(1, 'Upload at least 1 photo').max(10, 'Max 10 photos'),
	music: z.string().optional(),
	clip: clipSchema.optional(),
	style: styleSchema.prefault({}),
});

export type ProductImage = z.infer<typeof imageSchema>;
export type VideoClip = z.infer<typeof clipSchema>;
export type ProductVideoProps = z.infer<typeof productVideoSchema>;
export type ProductVideoInput = z.input<typeof productVideoSchema>;

export const VIDEO = {
	width: 1080,
	height: 1920,
	fps: 30,
} as const;
