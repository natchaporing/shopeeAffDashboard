import React from 'react';
import {Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Theme, VideoStyle} from '../style';
import {HEAD_START, LAYOUT, clamp} from './theme';

export function hookFontSize(text: string): number {
	const n = [...text].length;
	if (n <= 10) return 112;
	if (n <= 16) return 96;
	if (n <= 24) return 78;
	return 64;
}

type Props = {
	text: string;
	theme: Theme;
	variant: VideoStyle['hook'];
	/** over video footage: force white text with a strong shadow */
	onVideo?: boolean;
};

/** The big line at the top in the first seconds. Three looks: stroke-pop, label-box, clean. */
export const HookText: React.FC<Props> = ({text, theme, variant, onVideo}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const f = frame + HEAD_START;
	const size = hookFontSize(text);

	let inner: React.ReactNode;
	if (variant === 'label-box') {
		inner = (
			<div
				style={{
					fontSize: size * 0.9,
					fontWeight: 800,
					lineHeight: 1.12,
					padding: '10px 30px 14px',
					borderRadius: 18,
					backgroundColor: theme.accent,
					color: theme.onAccent,
					boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
					textWrap: 'balance',
					scale: String(spring({frame: f, fps, config: {damping: 10, stiffness: 170}})),
					// shake for the first second, then settle at a slight tilt
					rotate: `${-3 + Math.sin(frame / 2.2) * interpolate(frame, [0, 30], [3, 0], clamp)}deg`,
				}}
			>
				{text}
			</div>
		);
	} else if (variant === 'clean') {
		const color = onVideo ? '#FFFFFF' : theme.textOnBg;
		inner = (
			<div
				style={{
					fontSize: size * 0.92,
					fontWeight: 800,
					lineHeight: 1.12,
					letterSpacing: 0.5,
					color,
					textWrap: 'balance',
					textShadow: onVideo
						? '0 4px 24px rgba(0,0,0,0.6)'
						: color === '#FFFFFF'
							? `0 0 28px ${theme.primary}66`
							: 'none',
					opacity: interpolate(f, [0, 9], [0.2, 1], clamp),
					translate: `0px ${interpolate(f, [0, 18], [36, 0], {...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1)})}px`,
				}}
			>
				{text}
			</div>
		);
	} else {
		inner = (
			<div
				style={{
					fontSize: size,
					fontWeight: 800,
					lineHeight: 1.1,
					color: '#FFFFFF',
					textWrap: 'balance',
					WebkitTextStroke: `10px ${theme.primary}`,
					paintOrder: 'stroke fill',
					textShadow: '0 8px 24px rgba(0,0,0,0.45)',
					scale: String(spring({frame: f, fps, config: {damping: 9, stiffness: 160}})),
					rotate: `${Math.sin(frame / 5) * interpolate(frame, [0, 30], [2.5, 0], clamp)}deg`,
				}}
			>
				{text}
			</div>
		);
	}

	return (
		<div
			style={{
				position: 'absolute',
				left: LAYOUT.side,
				right: LAYOUT.side,
				top: LAYOUT.hookTop,
				height: LAYOUT.hookHeight,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				textAlign: 'center',
			}}
		>
			{inner}
		</div>
	);
};
