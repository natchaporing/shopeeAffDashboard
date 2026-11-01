import React from 'react';
import {AbsoluteFill, Easing, Img, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {cleanTitle, discountPercent, formatBaht, formatCount} from '../format';
import type {ProductVideoProps} from '../schema';
import type {Theme, VideoStyle} from '../style';
import {StyledBackground} from './Background';
import {ArrowDownIcon, CartIcon, StarIcon} from './Icons';
import {HEAD_START, LAYOUT, clamp} from './theme';

type CardProps = ProductVideoProps & {theme: Theme; top: number; compact?: boolean};

/**
 * Title + price + rating card. Static price on purpose: frame 0 is often used as the
 * cover, so it must show the real deal price. The countdown plays on the end card.
 */
export const PriceCard: React.FC<CardProps> = ({theme, top, compact, ...p}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	// starts nearly in place so frame 0 (the cover) shows the card; a short rise still reads as motion
	const slide = spring({frame: frame + HEAD_START + 4, fps, config: {damping: 16}});
	const pct = discountPercent(p.price, p.originalPrice);
	const glass = theme.cardBg.startsWith('rgba');
	// one short pulse on the price when the sticker lands
	const pulse = frame >= 18 && frame <= 30 ? 1 + Math.sin(((frame - 18) / 12) * Math.PI) * 0.06 : 1;

	return (
		<div
			style={{
				position: 'absolute',
				left: LAYOUT.side,
				top,
				width: LAYOUT.width - LAYOUT.side * 2,
				padding: compact ? '22px 40px 26px' : '30px 44px 34px',
				borderRadius: 40,
				backgroundColor: theme.cardBg,
				backdropFilter: glass ? 'blur(18px)' : undefined,
				border: glass ? '2px solid rgba(255,255,255,0.16)' : undefined,
				boxShadow: theme.cardShadow,
				translate: `0px ${interpolate(slide, [0, 1], [160, 0])}px`,
				boxSizing: 'border-box',
			}}
		>
			<div
				style={{
					fontSize: compact ? 40 : 44,
					fontWeight: 600,
					lineHeight: 1.25,
					color: theme.cardInk,
					display: '-webkit-box',
					WebkitLineClamp: compact ? 1 : 2,
					WebkitBoxOrient: 'vertical',
					overflow: 'hidden',
					maxWidth: 860,
				}}
			>
				{cleanTitle(p.title)}
			</div>
			{p.hidePrice ? (
				<div style={{display: 'flex', alignItems: 'baseline', gap: 20, marginTop: 8}}>
					<div style={{fontSize: compact ? 76 : 92, fontWeight: 800, color: theme.priceOnCard, lineHeight: 1.1}}>ราคาพิเศษ</div>
					{pct ? <div style={{fontSize: 42, fontWeight: 600, color: theme.accent}}>ลดสูงสุด {pct}%</div> : null}
				</div>
			) : (
				<div style={{display: 'flex', alignItems: 'baseline', gap: 24, marginTop: 6, flexWrap: 'wrap'}}>
					<div
						style={{
							fontSize: compact ? 88 : 104,
							fontWeight: 800,
							color: theme.priceOnCard,
							lineHeight: 1.1,
							scale: String(pulse),
							transformOrigin: 'left center',
						}}
					>
						{formatBaht(p.price)}
					</div>
					{pct && p.originalPrice ? (
						<div style={{fontSize: 44, color: theme.cardMuted, textDecoration: 'line-through', textDecorationThickness: 4}}>
							{formatBaht(p.originalPrice)}
						</div>
					) : null}
				</div>
			)}
			{compact ? null : <StatsRow rating={p.rating} sold={p.sold} theme={theme} />}
		</div>
	);
};

const StatsRow: React.FC<{rating?: number; sold?: number; theme: Theme}> = ({rating, sold, theme}) => {
	const parts: React.ReactNode[] = [];
	if (rating !== undefined && rating > 0) {
		parts.push(
			<span key="r" style={{display: 'inline-flex', alignItems: 'center', gap: 8}}>
				<StarIcon size={40} color="#FFB800" />
				<span style={{color: theme.cardInk, fontWeight: 600}}>{rating.toFixed(1)}</span>
			</span>,
		);
	}
	if (sold !== undefined && sold > 0) parts.push(<span key="s">ขายแล้ว {formatCount(sold)} ชิ้น</span>);
	if (parts.length === 0) return null;
	return (
		<div style={{display: 'flex', alignItems: 'center', gap: 18, marginTop: 8, fontSize: 38, color: theme.cardMuted}}>
			{parts.map((part, i) => (
				<React.Fragment key={i}>
					{i > 0 ? <span style={{opacity: 0.5}}>•</span> : null}
					{part}
				</React.Fragment>
			))}
		</div>
	);
};

/** Closing card: price-drop countdown, discount badge, pulsing call-to-action. */
export const EndCard: React.FC<ProductVideoProps & {theme: Theme; style: VideoStyle}> = ({theme, style, ...p}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const cover = p.images[0];
	const pct = discountPercent(p.price, p.originalPrice);

	const imgIn = spring({frame, fps, config: {damping: 13}});
	const priceIn = spring({frame: frame - 8, fps, config: {damping: 10, stiffness: 150}});
	const ctaIn = spring({frame: frame - 16, fps, config: {damping: 12}});
	const pulse = 1 + Math.max(0, Math.sin((frame - 20) / 4.5)) * 0.045;
	const bounce = Math.abs(Math.sin(frame / 6)) * 22;

	// "price drop" counter: rolls from the original price down to the deal price
	const dropFrom = pct && p.originalPrice ? p.originalPrice : p.price;
	const dropShown = interpolate(frame, [6, 30], [dropFrom, p.price], {...clamp, easing: Easing.out(Easing.cubic)});
	const dropSettled = frame >= 30 || dropFrom === p.price;
	const badgeIn = spring({frame: frame - 30, fps, config: {damping: 8, stiffness: 160}});
	const onPhoto = style.background === 'photo-blur';
	const text = onPhoto ? '#FFFFFF' : theme.textOnBg;
	const shadow = onPhoto || theme.textOnBg === '#FFFFFF' ? '0 8px 30px rgba(0,0,0,0.5)' : 'none';

	return (
		<AbsoluteFill>
			<StyledBackground style={style} theme={theme} image={cover} />
			{onPhoto ? <AbsoluteFill style={{backgroundColor: 'rgba(0,0,0,0.25)'}} /> : null}

			<div
				style={{
					position: 'absolute',
					left: (LAYOUT.width - 600) / 2,
					top: 250,
					width: 600,
					height: 600,
					borderRadius: 44,
					overflow: 'hidden',
					backgroundColor: '#FFFFFF',
					boxShadow: '0 30px 80px rgba(0,0,0,0.4)',
					scale: String(imgIn),
				}}
			>
				<Img src={cover.src} pauseWhenLoading style={{width: '100%', height: '100%', objectFit: 'contain'}} />
			</div>

			<div style={{position: 'absolute', left: LAYOUT.side, right: LAYOUT.side, top: 900, textAlign: 'center', color: text, scale: String(priceIn)}}>
				{p.hidePrice ? (
					<div style={{fontSize: 130, fontWeight: 800, lineHeight: 1.1, textShadow: shadow, color: onPhoto ? text : theme.priceOnBg}}>
						{pct ? `ลด ${pct}%` : 'ราคาพิเศษ'}
					</div>
				) : (
					<>
						<div style={{fontSize: 150, fontWeight: 800, lineHeight: 1.05, textShadow: shadow, fontVariantNumeric: 'tabular-nums', color: onPhoto ? text : theme.priceOnBg}}>
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
										backgroundColor: theme.accent,
										color: theme.onAccent,
										scale: String(badgeIn),
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
					left: (LAYOUT.width - 780) / 2,
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
					boxShadow: `0 16px 40px rgba(0,0,0,0.35), inset 0 -8px 0 ${theme.primaryDark}`,
					scale: String(ctaIn * pulse),
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
						color: text,
						fontSize: 46,
						fontWeight: 600,
						opacity: ctaIn,
						textShadow: shadow === 'none' ? 'none' : '0 4px 16px rgba(0,0,0,0.6)',
					}}
				>
					{p.ctaSub}
					<div style={{translate: `0px ${bounce}px`, marginTop: 6}}>
						<ArrowDownIcon size={64} color={text} />
					</div>
				</div>
			) : null}
		</AbsoluteFill>
	);
};
