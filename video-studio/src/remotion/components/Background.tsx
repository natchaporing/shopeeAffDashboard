import React from 'react';
import {AbsoluteFill, Img, interpolate, useCurrentFrame} from 'remotion';
import type {ProductImage} from '../schema';
import type {Theme, VideoStyle} from '../style';
import {clamp} from './theme';

/** Blurred, darkened copy of a photo filling the frame. */
export const PhotoBlur: React.FC<{image: ProductImage; dim?: number}> = ({image, dim = 0.5}) => (
	<AbsoluteFill style={{overflow: 'hidden'}}>
		<Img
			src={image.src}
			pauseWhenLoading
			style={{
				width: '100%',
				height: '100%',
				objectFit: 'cover',
				filter: `blur(38px) brightness(${dim}) saturate(1.2)`,
				scale: '1.2',
			}}
		/>
		<AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.45) 100%)'}} />
	</AbsoluteFill>
);

/**
 * Template background: the blurred photo, or a solid / gradient colour with one soft
 * glow drifting slowly so the frame never looks frozen.
 */
export const StyledBackground: React.FC<{style: VideoStyle; theme: Theme; image?: ProductImage}> = ({style, theme, image}) => {
	const frame = useCurrentFrame();
	if (style.background === 'photo-blur' && image) return <PhotoBlur image={image} />;

	return (
		<AbsoluteFill style={{background: theme.backgroundCss, overflow: 'hidden'}}>
			<AbsoluteFill
				style={{
					background: `radial-gradient(circle at center, ${theme.accent}38 0%, ${theme.accent}00 62%)`,
					width: 1400,
					height: 1400,
					left: -160,
					top: 260,
					translate: `${interpolate(frame, [0, 600], [-120, 160], clamp)}px ${interpolate(frame, [0, 600], [0, -220], clamp)}px`,
				}}
			/>
		</AbsoluteFill>
	);
};
