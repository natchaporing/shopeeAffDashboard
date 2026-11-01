import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import type {Shot} from '../templates/slideshow-plan';
import type {Theme} from '../style';
import {LAYOUT, clamp} from './theme';

/** Platform pill + optional ribbon ("FLASH SALE") in the top-left corner. */
export const Header: React.FC<{theme: Theme; ribbon: string}> = ({theme, ribbon}) => {
	const frame = useCurrentFrame();
	return (
		<div style={{position: 'absolute', left: LAYOUT.side, top: LAYOUT.badgeY, display: 'flex', gap: 12, alignItems: 'center'}}>
			<div
				style={{
					padding: '6px 22px',
					borderRadius: 999,
					backgroundColor: theme.platformColor,
					color: '#FFFFFF',
					fontSize: 30,
					fontWeight: 600,
					letterSpacing: 0.5,
				}}
			>
				{theme.platformName}
			</div>
			{ribbon ? (
				<div
					style={{
						padding: '6px 20px',
						borderRadius: 10,
						backgroundColor: theme.accent,
						color: theme.onAccent,
						fontSize: 30,
						fontWeight: 800,
						letterSpacing: 1.5,
						// quick double blink every second
						opacity: frame % 30 < 4 ? 0.55 : 1,
						rotate: '-2deg',
					}}
				>
					{ribbon}
				</div>
			) : null}
		</div>
	);
};

/** Story-style progress segments, one per shot. */
export const ProgressBar: React.FC<{shots: Shot[]; color: string}> = ({shots, color}) => {
	const frame = useCurrentFrame();
	return (
		<div style={{position: 'absolute', left: LAYOUT.side, right: LAYOUT.side, top: LAYOUT.progressY, display: 'flex', gap: 8}}>
			{shots.map((s, i) => (
				<div key={i} style={{flex: 1, height: 7, borderRadius: 4, backgroundColor: `${color}4D`, overflow: 'hidden'}}>
					<div
						style={{
							width: `${interpolate(frame, [s.from, s.from + s.duration], [0, 100], clamp)}%`,
							height: '100%',
							backgroundColor: color,
						}}
					/>
				</div>
			))}
		</div>
	);
};
