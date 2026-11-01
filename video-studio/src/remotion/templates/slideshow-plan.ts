import type {ProductImage} from '../schema';

/**
 * Timeline planning for the Multi-angle Slideshow template. Pure functions so the
 * same numbers drive the live preview, the render, and the unit tests.
 */

export const TIMING = {
	hookFrames: 60, // 2.0s: cover image + hook text
	shotFrames: 45, // 1.5s per gallery shot
	endFrames: 90, // 3.0s: price + call to action
	minGalleryShots: 3,
} as const;

export type Zoom = {
	from: number;
	to: number;
	/** transform-origin in % of the image box */
	originX: number;
	originY: number;
};

export type Shot = {
	kind: 'hook' | 'gallery' | 'detail' | 'end';
	image: ProductImage;
	from: number;
	duration: number;
	zoom: Zoom;
	/** slide-in direction for the cut: -1 from left, 1 from right, 0 none */
	enterFrom: -1 | 0 | 1;
};

export type SlideshowPlan = {
	shots: Shot[];
	durationInFrames: number;
	/** frame where the end card starts */
	endFrom: number;
};

// Focal points for "detail" shots: punch into different parts of a photo so a
// listing with 1-2 images still gets several distinct shots.
const DETAIL_FOCI: Array<[number, number]> = [
	[50, 50],
	[28, 30],
	[72, 70],
	[70, 28],
	[30, 72],
];

/**
 * Image #1 is the cover (hook + end card). The rest are gallery shots. When fewer
 * than `minGalleryShots` gallery images exist, pad with zoomed-in detail shots so
 * the video never feels like one static picture.
 */
export function planSlideshow(images: ProductImage[]): SlideshowPlan {
	if (images.length === 0) throw new Error('planSlideshow needs at least one image');
	const cover = images[0];

	const gallery: Array<{image: ProductImage; detail: boolean; focus?: [number, number]}> = images
		.slice(1)
		.map((image) => ({image, detail: false}));

	let i = 0;
	while (gallery.length < TIMING.minGalleryShots) {
		const image = images[i % images.length];
		const focus = DETAIL_FOCI[(Math.floor(i / images.length) + i) % DETAIL_FOCI.length];
		gallery.push({image, detail: true, focus});
		i++;
	}

	const shots: Shot[] = [];
	let t = 0;

	shots.push({
		kind: 'hook',
		image: cover,
		from: t,
		duration: TIMING.hookFrames,
		zoom: {from: 1.0, to: 1.08, originX: 50, originY: 50},
		enterFrom: 0,
	});
	t += TIMING.hookFrames;

	gallery.forEach((g, idx) => {
		const zoomIn = idx % 2 === 0;
		const zoom: Zoom = g.detail
			? {from: 1.7, to: 1.9, originX: g.focus![0], originY: g.focus![1]}
			: zoomIn
				? {from: 1.0, to: 1.1, originX: 50, originY: 45}
				: {from: 1.1, to: 1.0, originX: 50, originY: 55};
		shots.push({
			kind: g.detail ? 'detail' : 'gallery',
			image: g.image,
			from: t,
			duration: TIMING.shotFrames,
			zoom,
			enterFrom: idx % 2 === 0 ? 1 : -1,
		});
		t += TIMING.shotFrames;
	});

	const endFrom = t;
	shots.push({
		kind: 'end',
		image: cover,
		from: t,
		duration: TIMING.endFrames,
		zoom: {from: 1.0, to: 1.0, originX: 50, originY: 50},
		enterFrom: 0,
	});
	t += TIMING.endFrames;

	return {shots, durationInFrames: t, endFrom};
}

export function slideshowDuration(images: ProductImage[]): number {
	return planSlideshow(images.length ? images : [{src: 'placeholder'}]).durationInFrames;
}
