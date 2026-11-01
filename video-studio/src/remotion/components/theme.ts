import type {ProductVideoProps} from '../schema';

export type Theme = {
	name: string;
	primary: string;
	primaryDark: string;
	accent: string;
	onPrimary: string;
};

// Brand-adjacent colours only; no marketplace logos are drawn.
const THEMES: Record<ProductVideoProps['platform'], Theme> = {
	shopee: {
		name: 'Shopee',
		primary: '#EE4D2D',
		primaryDark: '#C73A1E',
		accent: '#FFB800',
		onPrimary: '#FFFFFF',
	},
	lazada: {
		name: 'Lazada',
		primary: '#2A1FB8',
		primaryDark: '#1A1380',
		accent: '#F7186A',
		onPrimary: '#FFFFFF',
	},
};

export function themeFor(platform: ProductVideoProps['platform']): Theme {
	return THEMES[platform];
}

export const SALE_RED = '#E8112D';
export const INK = '#16161A';
export const MUTED = '#6B6B76';

/**
 * Safe zones for 1080x1920 short-video apps. The bottom ~340px holds the caption /
 * shopping basket and the right column (x > ~950, y 1000-1650) holds the like /
 * comment / share buttons, so no essential text is placed there.
 */
export const LAYOUT = {
	side: 60,
	progressY: 44,
	badgeY: 74,
	hookTop: 140,
	hookHeight: 150,
	imageTop: 316,
	imageSize: 920,
	cardTop: 1262,
	safeBottom: 1580,
} as const;
