/**
 * Safe zones for 1080x1920 short-video apps. The bottom ~340px holds the caption /
 * shopping basket and the right column (x > ~950, y 1000-1650) holds the like /
 * comment / share buttons, so no essential text is placed there.
 */
export const LAYOUT = {
	width: 1080,
	side: 60,
	progressY: 44,
	badgeY: 74,
	hookTop: 140,
	hookHeight: 150,
	imageTop: 316,
	imageSize: 920,
	cardTop: 1262,
	clipCardTop: 1300,
	safeBottom: 1580,
} as const;

/** Entrances start part-way into their animation so frame 0 (often used as the cover) is complete. */
export const HEAD_START = 6;

export const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
