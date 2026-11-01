import React from 'react';

// Drawn as SVG so renders never depend on an emoji font being installed.

export const CartIcon: React.FC<{size: number; color: string}> = ({size, color}) => (
	<svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
		<path
			d="M3 4h2.2l2.3 10.2a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.4-1.1L21 8H6.3"
			stroke={color}
			strokeWidth={2.2}
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
		<circle cx={9.5} cy={19.5} r={1.6} fill={color} />
		<circle cx={17} cy={19.5} r={1.6} fill={color} />
	</svg>
);

export const StarIcon: React.FC<{size: number; color: string}> = ({size, color}) => (
	<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
		<path
			d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"
			fill={color}
		/>
	</svg>
);

export const ArrowDownIcon: React.FC<{size: number; color: string}> = ({size, color}) => (
	<svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
		<path d="M12 4v15M5.5 12.5L12 19l6.5-6.5" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
	</svg>
);
