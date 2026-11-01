import React from 'react';
import {spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Theme, VideoStyle} from '../style';

type Props = {
	pct: number;
	theme: Theme;
	variant: VideoStyle['sticker'];
	/** centre of the sticker in frame pixels */
	x: number;
	y: number;
	/** frame at which it pops in */
	at?: number;
};

const SIZE = 200;

function burstPoints(spikes: number, outer: number, inner: number): string {
	const pts: string[] = [];
	for (let i = 0; i < spikes * 2; i++) {
		const r = i % 2 === 0 ? outer : inner;
		const a = (Math.PI * i) / spikes - Math.PI / 2;
		pts.push(`${(outer + r * Math.cos(a)).toFixed(1)},${(outer + r * Math.sin(a)).toFixed(1)}`);
	}
	return pts.join(' ');
}

/** "ลด 51%" discount sticker: circle, starburst or angled tag. */
export const Sticker: React.FC<Props> = ({pct, theme, variant, x, y, at = 12}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const pop = spring({frame: frame - at, fps, config: {damping: 8, stiffness: 140}});

	const label = (
		<>
			<div style={{fontSize: 30, fontWeight: 600, lineHeight: 1}}>ลด</div>
			<div style={{fontSize: 62, fontWeight: 800, lineHeight: 1.05}}>{pct}%</div>
		</>
	);

	const base: React.CSSProperties = {
		position: 'absolute',
		left: x - SIZE / 2,
		top: y - SIZE / 2,
		width: SIZE,
		height: SIZE,
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'center',
		justifyContent: 'center',
		color: theme.onAccent,
		scale: String(pop),
	};

	if (variant === 'burst') {
		return (
			<div style={{...base, rotate: `${(frame * 0.6) % 360}deg`}}>
				<svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{position: 'absolute', inset: 0, filter: 'drop-shadow(0 10px 20px rgba(0,0,0,0.35))'}}>
					<polygon points={burstPoints(16, SIZE / 2, SIZE / 2 - 22)} fill={theme.accent} />
				</svg>
				<div style={{position: 'relative', textAlign: 'center', rotate: `${-(frame * 0.6) % 360}deg`}}>{label}</div>
			</div>
		);
	}

	if (variant === 'tag') {
		return (
			<div
				style={{
					...base,
					width: 230,
					height: 120,
					left: x - 115,
					top: y - 60,
					flexDirection: 'row',
					gap: 10,
					borderRadius: 22,
					backgroundColor: theme.accent,
					boxShadow: '0 12px 28px rgba(0,0,0,0.3)',
					rotate: '8deg',
				}}
			>
				<div style={{fontSize: 30, fontWeight: 600}}>ลด</div>
				<div style={{fontSize: 64, fontWeight: 800}}>{pct}%</div>
			</div>
		);
	}

	return (
		<div
			style={{
				...base,
				borderRadius: '50%',
				backgroundColor: theme.accent,
				border: '6px solid #FFFFFF',
				boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
				rotate: `${-30 + 40 * pop}deg`,
			}}
		>
			{label}
		</div>
	);
};
