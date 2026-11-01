import React, {useMemo} from 'react';
import {AbsoluteFill, Html5Audio, Img, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig, Easing} from 'remotion';
import {StyledBackground} from '../components/Background';
import {EndCard, PriceCard} from '../components/Cards';
import {Header, ProgressBar} from '../components/Header';
import {HookText} from '../components/HookText';
import {Sticker} from '../components/Sticker';
import {HEAD_START, LAYOUT, clamp} from '../components/theme';
import {FONT_FAMILY, loadFonts} from '../fonts';
import {discountPercent} from '../format';
import type {ProductVideoProps} from '../schema';
import {PACE, resolveTheme, type VideoStyle} from '../style';
import {planSlideshow, type Shot} from './slideshow-plan';

loadFonts();

/** Overlap between shots, so fades and slides reveal the previous photo instead of white. */
const OVERLAP = 10;

/**
 * Photo slideshow engine (9:16). Cover + hook, 3+ gallery shots with Ken Burns motion
 * inside a product card, price card, sticker, and a call-to-action end card. Every
 * visual choice (background, card, hook, sticker, pace, transition) comes from `style`.
 */
export const Slideshow: React.FC<ProductVideoProps> = (props) => {
	const {style} = props;
	const plan = useMemo(() => planSlideshow(props.images, PACE[style.pace]), [props.images, style.pace]);
	const theme = resolveTheme(style, props.platform);
	const {durationInFrames, fps} = useVideoConfig();
	const frame = useCurrentFrame();
	const mainShots = plan.shots.filter((s) => s.kind !== 'end');
	const endShot = plan.shots[plan.shots.length - 1];
	const pct = discountPercent(props.price, props.originalPrice);
	const cardIn = spring({frame: frame + HEAD_START, fps, config: {damping: 14, stiffness: 120}});

	return (
		<AbsoluteFill style={{backgroundColor: '#101014', fontFamily: FONT_FAMILY}}>
			{style.background === 'photo-blur' ? (
				mainShots.map((shot, i) => (
					<Sequence key={`bg-${i}`} from={shot.from} durationInFrames={shot.duration} name={`bg ${shot.kind}`}>
						<StyledBackground style={style} theme={theme} image={shot.image} />
					</Sequence>
				))
			) : (
				<Sequence durationInFrames={plan.endFrom} name="background">
					<StyledBackground style={style} theme={theme} />
				</Sequence>
			)}

			<Sequence durationInFrames={plan.endFrom} name="product card">
				<Header theme={theme} ribbon={style.ribbon} />
				{props.hook ? <HookText text={props.hook} theme={theme} variant={style.hook} /> : null}
				<div
					style={{
						position: 'absolute',
						left: (LAYOUT.width - LAYOUT.imageSize) / 2,
						top: LAYOUT.imageTop,
						width: LAYOUT.imageSize,
						height: LAYOUT.imageSize,
						borderRadius: 48,
						overflow: 'hidden',
						backgroundColor: '#FFFFFF',
						border: style.card === 'white' ? undefined : '3px solid rgba(255,255,255,0.16)',
						boxShadow: '0 30px 80px rgba(0,0,0,0.4)',
						scale: String(interpolate(cardIn, [0, 1], [0.86, 1])),
						opacity: Math.min(1, cardIn * 1.4),
					}}
				>
					{mainShots.map((shot, i) => (
						<Sequence
							key={`img-${i}`}
							from={shot.from}
							durationInFrames={shot.duration + (i < mainShots.length - 1 ? OVERLAP : 0)}
							name={`img ${shot.kind}`}
						>
							<ShotImage shot={shot} transition={style.transition} />
						</Sequence>
					))}
				</div>
				{pct ? (
					<Sticker
						pct={pct}
						theme={theme}
						variant={style.sticker}
						x={(LAYOUT.width + LAYOUT.imageSize) / 2 - 70}
						y={LAYOUT.imageTop + 50}
						at={18}
					/>
				) : null}
				<PriceCard {...props} theme={theme} top={LAYOUT.cardTop} />
			</Sequence>

			<Sequence from={endShot.from} durationInFrames={endShot.duration} name="end card">
				<EndCard {...props} theme={theme} style={style} />
			</Sequence>

			<ProgressBar shots={plan.shots} color={style.background === 'photo-blur' ? '#FFFFFF' : theme.textOnBg} />

			{props.music ? (
				<Html5Audio
					src={props.music}
					volume={(f) => interpolate(f, [0, 12, durationInFrames - 30, durationInFrames], [0, 0.8, 0.8, 0], clamp)}
				/>
			) : null}
		</AbsoluteFill>
	);
};

const ShotImage: React.FC<{shot: Shot; transition: VideoStyle['transition']}> = ({shot, transition}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const isCut = shot.kind !== 'hook';
	const enter = spring({frame, fps, config: {damping: 18, stiffness: 180}});
	const kenBurns = interpolate(frame, [0, shot.duration], [shot.zoom.from, shot.zoom.to], {
		...clamp,
		easing: Easing.inOut(Easing.quad),
	});
	const punch = isCut && transition === 'zoom' ? interpolate(frame, [0, 8], [1.25, 1], {...clamp, easing: Easing.out(Easing.cubic)}) : 1;
	const dx = isCut && transition === 'slide' ? shot.enterFrom * interpolate(enter, [0, 1], [260, 0]) : 0;
	const opacity = isCut && transition === 'fade' ? interpolate(frame, [0, OVERLAP], [0, 1], clamp) : 1;
	const flash = isCut && transition !== 'fade' ? interpolate(frame, [0, 6], [0.45, 0], clamp) : 0;

	return (
		<AbsoluteFill style={{opacity}}>
			<Img
				src={shot.image.src}
				pauseWhenLoading
				style={{
					width: '100%',
					height: '100%',
					objectFit: 'contain',
					translate: `${dx}px 0px`,
					scale: String(kenBurns * punch),
					transformOrigin: `${shot.zoom.originX}% ${shot.zoom.originY}%`,
				}}
			/>
			{flash > 0 ? <AbsoluteFill style={{backgroundColor: `rgba(255,255,255,${flash})`}} /> : null}
		</AbsoluteFill>
	);
};
