import {z} from 'zod';

/**
 * Props for every product-video template. The web form, the live preview, the
 * render server and the tests all validate against this one schema.
 *
 * Image / audio fields are URLs. In the browser they are relative (`/uploads/x.jpg`);
 * the render server turns them into absolute URLs the headless browser can load.
 */
export const imageSchema = z.object({
	src: z.string().min(1),
	width: z.number().int().positive().optional(),
	height: z.number().int().positive().optional(),
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
	images: z.array(imageSchema).min(1, 'Upload at least 1 image').max(10, 'Max 10 images'),
	music: z.string().optional(),
});

export type ProductImage = z.infer<typeof imageSchema>;
export type ProductVideoProps = z.infer<typeof productVideoSchema>;
export type ProductVideoInput = z.input<typeof productVideoSchema>;

export const VIDEO = {
	width: 1080,
	height: 1920,
	fps: 30,
} as const;
