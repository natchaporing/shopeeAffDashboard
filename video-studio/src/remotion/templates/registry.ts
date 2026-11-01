import type React from 'react';
import {VIDEO, type ProductVideoProps} from '../schema';
import {MultiAngleSlideshow} from './MultiAngleSlideshow';
import {slideshowDuration} from './slideshow-plan';

/**
 * Template manifest. Adding a template = one component + one entry here; the web
 * gallery, the preview, the server-side validation and the Remotion Studio all
 * read from this list.
 */
export type TemplateManifest = {
	id: string;
	name: string;
	nameTh: string;
	description: string;
	width: number;
	height: number;
	fps: number;
	minImages: number;
	/** below this the template still works but pads with detail shots */
	recommendedImages: number;
	maxImages: number;
	acceptsVideo: boolean;
	/** pipeline steps beyond plain rendering (none yet: 'tts' | 'ai-video' | 'bg-removal') */
	steps: string[];
	durationInFrames: (props: ProductVideoProps) => number;
	component: React.FC<ProductVideoProps>;
};

export const TEMPLATES: TemplateManifest[] = [
	{
		id: 'multi-angle-slideshow',
		name: 'Multi-angle Slideshow',
		nameTh: 'สไลด์โชว์หลายมุม',
		description: 'Hook + 3-9 product shots with motion, price-drop counter, call-to-action end card. 9-19s.',
		...VIDEO,
		minImages: 1,
		recommendedImages: 4,
		maxImages: 10,
		acceptsVideo: false,
		steps: [],
		durationInFrames: (props) => slideshowDuration(props.images),
		component: MultiAngleSlideshow,
	},
];

export function getTemplate(id: string): TemplateManifest | undefined {
	return TEMPLATES.find((t) => t.id === id);
}
