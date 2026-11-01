import {z} from 'zod';

/**
 * Look & feel of a template, passed to the video as data. A new "preset" is just a
 * new style object, so presets can be created in the web app without code.
 */
export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #EE4D2D');

export const styleSchema = z.object({
	/** price / button colour; "platform" = Shopee orange or Lazada blue */
	primary: z.union([z.literal('platform'), hexColor]).default('platform'),
	/** discount sticker colour */
	accent: hexColor.default('#E8112D'),
	background: z.enum(['photo-blur', 'solid', 'gradient']).default('photo-blur'),
	bg1: hexColor.default('#101014'),
	bg2: hexColor.default('#2A2A35'),
	/** colour of text placed directly on the background (hook, end card) */
	textOnBg: z.enum(['light', 'dark']).default('light'),
	card: z.enum(['white', 'dark', 'glass']).default('white'),
	hook: z.enum(['stroke-pop', 'label-box', 'clean']).default('stroke-pop'),
	sticker: z.enum(['circle', 'burst', 'tag']).default('circle'),
	pace: z.enum(['fast', 'normal', 'slow']).default('normal'),
	transition: z.enum(['slide', 'zoom', 'fade']).default('slide'),
	/** small banner next to the platform badge, e.g. "FLASH SALE"; empty = none */
	ribbon: z.string().trim().max(20).default(''),
});

export type VideoStyle = z.infer<typeof styleSchema>;
export type VideoStyleInput = z.input<typeof styleSchema>;

export const DEFAULT_STYLE: VideoStyle = styleSchema.parse({});

export const STYLE_CHOICES = {
	background: ['photo-blur', 'solid', 'gradient'],
	textOnBg: ['light', 'dark'],
	card: ['white', 'dark', 'glass'],
	hook: ['stroke-pop', 'label-box', 'clean'],
	sticker: ['circle', 'burst', 'tag'],
	pace: ['fast', 'normal', 'slow'],
	transition: ['slide', 'zoom', 'fade'],
} as const;

export type Timing = {hookFrames: number; shotFrames: number; endFrames: number};

export const PACE: Record<VideoStyle['pace'], Timing> = {
	fast: {hookFrames: 45, shotFrames: 30, endFrames: 75},
	normal: {hookFrames: 60, shotFrames: 45, endFrames: 90},
	slow: {hookFrames: 75, shotFrames: 60, endFrames: 105},
};

const PLATFORM = {
	shopee: {name: 'Shopee', color: '#EE4D2D'},
	lazada: {name: 'Lazada', color: '#2A1FB8'},
} as const;

/** Relative luminance (WCAG) of a #rrggbb colour. */
export function luminance(hex: string): number {
	const [r, g, b] = [1, 3, 5].map((i) => {
		const c = parseInt(hex.slice(i, i + 2), 16) / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Black-ish or white text, whichever reads better on the given background. */
export function readableOn(hex: string): string {
	return luminance(hex) > 0.4 ? '#16161A' : '#FFFFFF';
}

export function shade(hex: string, amount: number): string {
	const n = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
	const out = n.map((c) => Math.max(0, Math.min(255, Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount))));
	return '#' + out.map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export type Theme = {
	platformName: string;
	platformColor: string;
	primary: string;
	primaryDark: string;
	onPrimary: string;
	accent: string;
	onAccent: string;
	/** CSS background for solid / gradient modes (photo-blur draws the photo instead) */
	backgroundCss: string;
	textOnBg: string;
	textOnBgSoft: string;
	cardBg: string;
	cardInk: string;
	cardMuted: string;
	cardShadow: string;
	/** primary adjusted so the price stays readable on the card */
	priceOnCard: string;
	/** primary adjusted so the big end-card price stays readable on the background */
	priceOnBg: string;
};

export function resolveTheme(style: VideoStyle, platform: keyof typeof PLATFORM): Theme {
	const p = PLATFORM[platform];
	const primary = style.primary === 'platform' ? p.color : style.primary;
	const card =
		style.card === 'white'
			? {cardBg: '#FFFFFF', cardInk: '#16161A', cardMuted: '#6B6B76', cardShadow: '0 20px 60px rgba(0,0,0,0.30)'}
			: style.card === 'dark'
				? {cardBg: '#16161C', cardInk: '#FFFFFF', cardMuted: '#A9A9B6', cardShadow: '0 20px 60px rgba(0,0,0,0.45)'}
				: {cardBg: 'rgba(20,24,38,0.62)', cardInk: '#FFFFFF', cardMuted: '#B9C0D4', cardShadow: '0 20px 60px rgba(0,0,0,0.35)'};
	const lightCard = style.card === 'white';
	const primaryLum = luminance(primary);
	const priceOnCard = lightCard
		? primaryLum > 0.45
			? shade(primary, -0.5)
			: primary
		: primaryLum < 0.18
			? shade(primary, 0.55)
			: primary;
	const lightBg = style.textOnBg === 'dark';
	const priceOnBg = lightBg ? (primaryLum > 0.45 ? shade(primary, -0.5) : primary) : '#FFFFFF';
	return {
		priceOnCard,
		priceOnBg,
		platformName: p.name,
		platformColor: p.color,
		primary,
		primaryDark: shade(primary, -0.25),
		onPrimary: readableOn(primary),
		accent: style.accent,
		onAccent: readableOn(style.accent),
		backgroundCss:
			style.background === 'gradient' ? `linear-gradient(160deg, ${style.bg1} 0%, ${style.bg2} 100%)` : style.bg1,
		textOnBg: style.textOnBg === 'light' ? '#FFFFFF' : '#1E1B1C',
		textOnBgSoft: style.textOnBg === 'light' ? 'rgba(255,255,255,0.8)' : 'rgba(30,27,28,0.72)',
		...card,
	};
}
