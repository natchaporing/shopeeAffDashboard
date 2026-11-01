import type React from 'react';
import {VIDEO, type ProductVideoProps} from './schema';
import {PACE} from './style';
import {ClipOverlay, clipFrames} from './templates/ClipOverlay';
import {Slideshow} from './templates/Slideshow';
import {slideshowDuration} from './templates/slideshow-plan';
import type {EngineId} from '../shared/templates';

/**
 * Engines are the code part of templates: one React composition each. Templates
 * (style + master prompt) are data and pick one of these by id. The Remotion
 * composition id equals the engine id.
 */
export type Engine = {
	id: EngineId;
	label: string;
	width: number;
	height: number;
	fps: number;
	minImages: number;
	maxImages: number;
	usesClip: boolean;
	durationInFrames: (props: ProductVideoProps) => number;
	component: React.FC<ProductVideoProps>;
};

export const ENGINES: Record<EngineId, Engine> = {
	slideshow: {
		id: 'slideshow',
		label: 'Photo slideshow',
		...VIDEO,
		minImages: 1,
		maxImages: 10,
		usesClip: false,
		durationInFrames: (p) => slideshowDuration(p.images, PACE[p.style.pace]),
		component: Slideshow,
	},
	clip: {
		id: 'clip',
		label: 'Video clip + overlays',
		...VIDEO,
		minImages: 1,
		maxImages: 10,
		usesClip: true,
		durationInFrames: (p) => clipFrames(p.clip, VIDEO.fps) + PACE[p.style.pace].endFrames,
		component: ClipOverlay,
	},
};
