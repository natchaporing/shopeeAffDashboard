import React, {useMemo} from 'react';
import {
	AbsoluteFill,
	Easing,
	Html5Audio,
	Img,
	Sequence,
	interpolate,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from 'remotion';
import {ArrowDownIcon, CartIcon, StarIcon} from '../components/Icons';
import {INK, LAYOUT, MUTED, SALE_RED, themeFor, type Theme} from '../components/theme';
import {FONT_FAMILY, loadFonts} from '../fonts';
import {cleanTitle, discountPercent, formatBaht, formatCount} from '../format';
import type {ProductImage, ProductVideoProps} from '../schema';
import {planSlideshow, type Shot} from './slideshow-plan';

loadFonts();

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const ENTRANCE_HEAD_START = 6;

/**
 * Multi-angle Slideshow (9:16). Cover image + hook, 3+ gallery shots with Ken Burns
 * motion inside a product card, a price card with a "price drop" counter, and a
 * call-to-action end card. Works with a single image by adding zoomed detail shots.
 */
export const MultiAngleSlideshow: React.FC<ProductVideoProps> = (props) => {
	const plan = useMemo(() => planSlideshow(props.images), [props.images]);
	const theme = themeFor(props.platform);
	const {durationInFrames} = useVideoConfig();
	const mainShots = plan.shots.filter((s) => s.kind !== 'end');
	const endShot = plan.shots[plan.shots.length - 1];

	return (
		<AbsoluteFill style={{backgroundColor: '#101014', fontFamily: FONT_FAMILY}}>
			{mainShots.map((shot, i) => (
				<Sequence key={`bg-${i}`} from={shot.from} durationInFrames={shot.duration} name={`bg ${shot.kind}`}>
					<Backdrop image={shot.image} />
				</Sequence>
			))}

			<Sequence from={0} durationInFrames={plan.endFrom} name="product card">
				<MainLayout {...props} theme={theme} shots={mainShots} />
			</Sequence>

			<Sequence from={endShot.from} durationInFrames={endShot.duration} name="end card">
				<EndCard {...props} theme={theme} />
			</Sequence>

			<ProgressBar shots={plan.shots} total={durationInFrames} />

			{props.music ? (
				<Html5Audio
					src={props.music}
					volume={(f) => interpolate(f, [0, 12, durationInFrames - 30, durationInFrames], [0, 0.8, 0.8, 0], clamp)}
				/>
			) : null}
		</AbsoluteFill>
	);
};

/* ------------------------------------------------------------------ backdrop */

const Backdrop: React.FC<{image: ProductImage}> = ({image}) => (
	<AbsoluteFill style={{overflow: 'hidden'}}>
		<Img
			src={image.src}
			pauseWhenLoading
			style={{
				width: '100%',
				height: '100%',
				objectFit: 'cover',
				filter: 'blur(38px) brightness(0.5) saturate(1.2)',
				transform: 'scale(1.2)',
			}}
		/>
		<AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.45) 100%)'}} />
	</AbsoluteFill>
);

/* --------------------------------------------------------------- main layout */

type LayoutProps = ProductVideoProps & {theme: Theme; shots: Shot[]};

const MainLayout: React.FC<LayoutProps> = ({theme, shots, ...p}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();

	// Entrances start part-way through their springs so frame 0 already shows the
	// product, price and hook: apps often use the first frame as the cover image.
	const cardIn = spring({frame: frame + ENTRANCE_HEAD_START, fps, config: {damping: 14, stiffness: 120}});
	const infoIn = spring({frame: frame + ENTRANCE_HEAD_START - 4, fps, config: {damping: 16}});
	const pct = discountPercent(p.price, p.originalPrice);

	return (
		<AbsoluteFill>
			<PlatformBadge theme={theme} />
			{p.hook ? <HookText text={p.hook} theme={theme} /> : null}

			{/* product image card */}
			<div
				style={{
					position: 'absolute',
					left: (1080 - LAYOUT.imageSize) / 2,
					top: LAYOUT.imageTop,
					width: LAYOUT.imageSize,
					height: LAYOUT.imageSize,
					borderRadius: 48,
					overflow: 'hidden',
					backgroundColor: '#FFFFFF',
					boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
					transform: `scale(${interpolate(cardIn, [0, 1], [0.86, 1])})`,
					opacity: Math.min(1, cardIn * 1.4),
				}}
			>
				{shots.map((shot, i) => (
					<Sequence key={`img-${i}`} from={shot.from} durationInFrames={shot.duration} name={`img ${shot.kind}`}>
						<ShotImage shot={shot} />
					</Sequence>
				))}
			</div>

			{pct ? <DiscountSticker pct={pct} /> : null}

			{/* info card */}
			<div
				style={{
					position: 'absolute',
					left: LAYOUT.side,
					top: LAYOUT.cardTop,
					width: 1080 - LAYOUT.side * 2,
					padding: '30px 44px 34px',
					borderRadius: 40,
					backgroundColor: '#FFFFFF',
					boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
					transform: `translateY(${interpolate(infoIn, [0, 1], [380, 0])}px)`,
					boxSizing: 'border-box',
				}}
			>
				<div
					style={{
						fontSize: 44,
						fontWeight: 600,
						lineHeight: 1.25,
						color: INK,
						display: '-webkit-box',
						WebkitLineClamp: 2,
						WebkitBoxOrient: 'vertical',
						overflow: 'hidden',
						maxWidth: 860,
					}}
				>
					{cleanTitle(p.title)}
				</div>
				<PriceRow {...p} theme={theme} />
				<StatsRow rating={p.rating} sold={p.sold} />
			</div>
		</AbsoluteFill>
	);
};

const ShotImage: React.FC<{shot: Shot}> = ({shot}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const progress = interpolate(frame, [0, shot.duration], [0, 1], {...clamp, easing: Easing.inOut(Easing.quad)});
	const scale = interpolate(progress, [0, 1], [shot.zoom.from, shot.zoom.to]);
	const enter = spring({frame, fps, config: {damping: 18, stiffness: 180}});
	const dx = shot.enterFrom * interpolate(enter, [0, 1], [260, 0]);
	const flash = shot.kind === 'hook' ? 0 : interpolate(frame, [0, 6], [0.45, 0], clamp);

	return (
		<AbsoluteFill>
			<Img
				src={shot.image.src}
				pauseWhenLoading
				style={{
					width: '100%',
					height: '100%',
					objectFit: 'contain',
					transform: `translateX(${dx}px) scale(${scale})`,
					transformOrigin: `${shot.zoom.originX}% ${shot.zoom.originY}%`,
				}}
			/>
			{flash > 0 ? <AbsoluteFill style={{backgroundColor: `rgba(255,255,255,${flash})`}} /> : null}
		</AbsoluteFill>
	);
};

const PlatformBadge: React.FC<{theme: Theme}> = ({theme}) => (
	<div
		style={{
			position: 'absolute',
			left: LAYOUT.side,
			top: LAYOUT.badgeY,
			padding: '6px 22px',
			borderRadius: 999,
			backgroundColor: theme.primary,
			color: theme.onPrimary,
			fontSize: 30,
			fontWeight: 600,
			letterSpacing: 0.5,
		}}
	>
		{theme.name}
	</div>
);

export function hookFontSize(text: string): number {
	const n = [...text].length;
	if (n <= 10) return 112;
	if (n <= 16) return 96;
	if (n <= 24) return 78;
	return 64;
}

const HookText: React.FC<{text: string; theme: Theme}> = ({text, theme}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const pop = spring({frame: frame + ENTRANCE_HEAD_START, fps, config: {damping: 9, stiffness: 160}});
	const wiggle = Math.sin(frame / 5) * interpolate(frame, [0, 30], [2.5, 0], clamp);

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
			<div
				style={{
					fontSize: hookFontSize(text),
					fontWeight: 800,
					lineHeight: 1.1,
					color: '#FFFFFF',
					textWrap: 'balance',
					WebkitTextStroke: `10px ${theme.primary}`,
					paintOrder: 'stroke fill',
					textShadow: '0 8px 24px rgba(0,0,0,0.45)',
					transform: `scale(${pop}) rotate(${wiggle}deg)`,
				}}
			>
				{text}
			</div>
		</div>
	);
};

const DiscountSticker: React.FC<{pct: number}> = ({pct}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const pop = spring({frame: frame - 18, fps, config: {damping: 8, stiffness: 140}});
	const size = 190;
	return (
		<div
			style={{
				position: 'absolute',
				left: (1080 + LAYOUT.imageSize) / 2 - size + 30,
				top: LAYOUT.imageTop - 40,
				width: size,
				height: size,
				borderRadius: '50%',
				backgroundColor: SALE_RED,
				color: '#FFFFFF',
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				justifyContent: 'center',
				boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
				border: '6px solid #FFFFFF',
				transform: `scale(${pop}) rotate(${interpolate(pop, [0, 1], [-30, 10])}deg)`,
			}}
		>
			<div style={{fontSize: 30, fontWeight: 600, lineHeight: 1}}>ลด</div>
			<div style={{fontSize: 62, fontWeight: 800, lineHeight: 1.05}}>{pct}%</div>
		</div>
	);
};

const PriceRow: React.FC<ProductVideoProps & {theme: Theme}> = ({price, originalPrice, hidePrice, theme}) => {
	const frame = useCurrentFrame();
	const pct = discountPercent(price, originalPrice);

	if (hidePrice) {
		return (
			<div style={{display: 'flex', alignItems: 'baseline', gap: 20, marginTop: 10}}>
				<div style={{fontSize: 92, fontWeight: 800, color: theme.primary, lineHeight: 1.1}}>ราคาพิเศษ</div>
				{pct ? <div style={{fontSize: 44, fontWeight: 600, color: SALE_RED}}>ลดสูงสุด {pct}%</div> : null}
			</div>
		);
	}

	// Static on purpose: frame 0 is often used as the cover, so it must show the real
	// deal price. The "price drop" counter plays on the end card instead.
	// one short pulse on the price when the discount sticker lands
	const pulse = frame >= 18 && frame <= 30 ? 1 + Math.sin(((frame - 18) / 12) * Math.PI) * 0.06 : 1;

	return (
		<div style={{display: 'flex', alignItems: 'baseline', gap: 24, marginTop: 6, flexWrap: 'wrap'}}>
			<div
				style={{
					fontSize: 104,
					fontWeight: 800,
					color: theme.primary,
					lineHeight: 1.1,
					transform: `scale(${pulse})`,
					transformOrigin: 'left center',
				}}
			>
				{formatBaht(price)}
			</div>
			{pct && originalPrice ? (
				<div style={{fontSize: 44, fontWeight: 400, color: MUTED, textDecoration: 'line-through', textDecorationThickness: 4}}>
					{formatBaht(originalPrice)}
				</div>
			) : null}
		</div>
	);
};

const StatsRow: React.FC<{rating?: number; sold?: number}> = ({rating, sold}) => {
	const parts: React.ReactNode[] = [];
	if (rating !== undefined && rating > 0) {
		parts.push(
			<span key="r" style={{display: 'inline-flex', alignItems: 'center', gap: 8}}>
				<StarIcon size={40} color="#FFB800" />
				<span style={{color: INK, fontWeight: 600}}>{rating.toFixed(1)}</span>
			</span>,
		);
	}
	if (sold !== undefined && sold > 0) {
		parts.push(<span key="s">ขายแล้ว {formatCount(sold)} ชิ้น</span>);
	}
	if (parts.length === 0) return null;
	return (
		<div style={{display: 'flex', alignItems: 'center', gap: 18, marginTop: 8, fontSize: 38, color: MUTED}}>
			{parts.map((part, i) => (
				<React.Fragment key={i}>
					{i > 0 ? <span style={{opacity: 0.5}}>•</span> : null}
					{part}
				</React.Fragment>
			))}
		</div>
	);
};

/* ------------------------------------------------------------------ end card */

const EndCard: React.FC<ProductVideoProps & {theme: Theme}> = ({theme, ...p}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const cover = p.images[0];
	const pct = discountPercent(p.price, p.originalPrice);

	const imgIn = spring({frame, fps, config: {damping: 13}});
	const priceIn = spring({frame: frame - 8, fps, config: {damping: 10, stiffness: 150}});
	const ctaIn = spring({frame: frame - 16, fps, config: {damping: 12}});
	const pulse = 1 + Math.max(0, Math.sin((frame - 20) / 4.5)) * 0.045;
	const bounce = Math.abs(Math.sin(frame / 6)) * 22;

	// "price drop" counter: rolls from the original price down to the deal price.
	const dropFrom = pct && p.originalPrice ? p.originalPrice : p.price;
	const dropShown = interpolate(frame, [6, 30], [dropFrom, p.price], {...clamp, easing: Easing.out(Easing.cubic)});
	const dropSettled = frame >= 30 || dropFrom === p.price;
	const badgeIn = spring({frame: frame - 30, fps, config: {damping: 8, stiffness: 160}});

	return (
		<AbsoluteFill>
			<Backdrop image={cover} />
			<AbsoluteFill style={{backgroundColor: 'rgba(0,0,0,0.25)'}} />

			<div
				style={{
					position: 'absolute',
					left: (1080 - 600) / 2,
					top: 250,
					width: 600,
					height: 600,
					borderRadius: 44,
					overflow: 'hidden',
					backgroundColor: '#FFFFFF',
					boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
					transform: `scale(${imgIn})`,
				}}
			>
				<Img src={cover.src} pauseWhenLoading style={{width: '100%', height: '100%', objectFit: 'contain'}} />
			</div>

			<div
				style={{
					position: 'absolute',
					left: LAYOUT.side,
					right: LAYOUT.side,
					top: 900,
					textAlign: 'center',
					color: '#FFFFFF',
					transform: `scale(${priceIn})`,
				}}
			>
				{p.hidePrice ? (
					<div style={{fontSize: 130, fontWeight: 800, lineHeight: 1.1, textShadow: '0 8px 30px rgba(0,0,0,0.5)'}}>
						{pct ? `ลด ${pct}%` : 'ราคาพิเศษ'}
					</div>
				) : (
					<>
						<div
							style={{
								fontSize: 150,
								fontWeight: 800,
								lineHeight: 1.05,
								textShadow: '0 8px 30px rgba(0,0,0,0.5)',
								fontVariantNumeric: 'tabular-nums',
							}}
						>
							{formatBaht(dropSettled ? p.price : Math.round(dropShown))}
						</div>
						{pct && p.originalPrice ? (
							<div style={{fontSize: 46, fontWeight: 600, marginTop: 4}}>
								<span style={{textDecoration: 'line-through', opacity: 0.75}}>{formatBaht(p.originalPrice)}</span>
								<span
									style={{
										display: 'inline-block',
										marginLeft: 18,
										padding: '2px 18px',
										borderRadius: 14,
										backgroundColor: SALE_RED,
										transform: `scale(${badgeIn})`,
									}}
								>
									-{pct}%
								</span>
							</div>
						) : null}
					</>
				)}
			</div>

			<div
				style={{
					position: 'absolute',
					left: (1080 - 780) / 2,
					top: 1220,
					width: 780,
					height: 150,
					borderRadius: 75,
					backgroundColor: theme.primary,
					color: theme.onPrimary,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					gap: 22,
					fontSize: 66,
					fontWeight: 800,
					boxShadow: `0 16px 40px rgba(0,0,0,0.4), inset 0 -8px 0 ${theme.primaryDark}`,
					transform: `scale(${ctaIn * pulse})`,
				}}
			>
				<CartIcon size={78} color={theme.onPrimary} />
				{p.cta}
			</div>

			{p.ctaSub ? (
				<div
					style={{
						position: 'absolute',
						left: LAYOUT.side,
						right: LAYOUT.side,
						top: 1400,
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						color: '#FFFFFF',
						fontSize: 46,
						fontWeight: 600,
						opacity: ctaIn,
						textShadow: '0 4px 16px rgba(0,0,0,0.6)',
					}}
				>
					{p.ctaSub}
					<div style={{transform: `translateY(${bounce}px)`, marginTop: 6}}>
						<ArrowDownIcon size={64} color="#FFFFFF" />
					</div>
				</div>
			) : null}
		</AbsoluteFill>
	);
};

/* -------------------------------------------------------------- progress bar */

const ProgressBar: React.FC<{shots: Shot[]; total: number}> = ({shots}) => {
	const frame = useCurrentFrame();
	return (
		<div
			style={{
				position: 'absolute',
				left: LAYOUT.side,
				right: LAYOUT.side,
				top: LAYOUT.progressY,
				display: 'flex',
				gap: 8,
			}}
		>
			{shots.map((s, i) => {
				const fill = interpolate(frame, [s.from, s.from + s.duration], [0, 100], clamp);
				return (
					<div key={i} style={{flex: 1, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden'}}>
						<div style={{width: `${fill}%`, height: '100%', backgroundColor: '#FFFFFF'}} />
					</div>
				);
			})}
		</div>
	);
};
