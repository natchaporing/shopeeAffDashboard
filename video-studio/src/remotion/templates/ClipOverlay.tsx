import {Video} from '@remotion/media';
import React from 'react';
import {AbsoluteFill, Easing, Html5Audio, Img, Sequence, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {PhotoBlur} from '../components/Background';
import {EndCard, PriceCard} from '../components/Cards';
import {Header} from '../components/Header';
import {HookText} from '../components/HookText';
import {Sticker} from '../components/Sticker';
import {LAYOUT, clamp} from '../components/theme';
import {FONT_FAMILY, loadFonts} from '../fonts';
import {discountPercent} from '../format';
import {MAX_CLIP_SECONDS, type ProductImage, type ProductVideoProps, type VideoClip} from '../schema';
import {PACE, resolveTheme} from '../style';

loadFonts();

/** Seconds of preview shown before a clip has been uploaded. */
export const PLACEHOLDER_CLIP_SECONDS = 5;

/** How many frames of the clip are used (long clips are cut at MAX_CLIP_SECONDS). */
export function clipFrames(clip: VideoClip | undefined, fps: number): number {
	const seconds = clip ? Math.min(clip.durationInSeconds, MAX_CLIP_SECONDS) : PLACEHOLDER_CLIP_SECONDS;
	return Math.max(fps, Math.floor(seconds * fps));
}

/**
 * Clip engine (9:16): a video clip full screen (your own footage or an AI clip) with
 * hook, price card and sticker on top, then the call-to-action end card. Without a
 * clip yet, the cover photo stands in so the preview still works.
 */
export const ClipOverlay: React.FC<ProductVideoProps> = (props) => {
	const {style, clip} = props;
	const theme = resolveTheme(style, props.platform);
	const {fps, durationInFrames} = useVideoConfig();
	const mainFrames = clipFrames(clip, fps);
	const endFrames = PACE[style.pace].endFrames;
	const pct = discountPercent(props.price, props.originalPrice);
	const cardTop = LAYOUT.clipCardTop;

	return (
		<AbsoluteFill style={{backgroundColor: '#000', fontFamily: FONT_FAMILY}}>
			<Sequence durationInFrames={mainFrames} name="clip">
				{clip ? (
					<Video
						src={clip.src}
						objectFit="cover"
						muted={!clip.keepAudio}
						volume={props.music ? 0.9 : 1}
						style={{width: '100%', height: '100%'}}
					/>
				) : (
					<CoverStandIn image={props.images[0]} frames={mainFrames} />
				)}
				{/* keep text readable on any footage */}
				<AbsoluteFill
					style={{
						background:
							'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 24%, rgba(0,0,0,0) 58%, rgba(0,0,0,0.55) 100%)',
					}}
				/>
				<Header theme={theme} ribbon={style.ribbon} />
				{props.hook ? <HookText text={props.hook} theme={theme} variant={style.hook} onVideo /> : null}
				<PriceCard {...props} theme={theme} top={cardTop} compact />
				{pct ? <Sticker pct={pct} theme={theme} variant={style.sticker} x={LAYOUT.width - LAYOUT.side - 90} y={cardTop - 40} at={14} /> : null}
			</Sequence>

			<Sequence from={mainFrames} durationInFrames={endFrames} name="end card">
				<EndCard {...props} theme={theme} style={style} />
			</Sequence>

			{props.music ? (
				<Html5Audio
					src={props.music}
					volume={(f) =>
						interpolate(f, [0, 12, durationInFrames - 30, durationInFrames], [0, 1, 1, 0], clamp) *
						(clip?.keepAudio ? 0.35 : 0.8)
					}
				/>
			) : null}
		</AbsoluteFill>
	);
};

/** Placeholder until a clip is uploaded: the cover photo with a slow push-in. */
const CoverStandIn: React.FC<{image: ProductImage; frames: number}> = ({image, frames}) => {
	const frame = useCurrentFrame();
	return (
		<AbsoluteFill>
			<PhotoBlur image={image} />
			<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
				<Img
					src={image.src}
					pauseWhenLoading
					style={{
						width: 900,
						height: 900,
						objectFit: 'contain',
						borderRadius: 40,
						marginTop: -120,
						scale: String(interpolate(frame, [0, frames], [1, 1.12], {...clamp, easing: Easing.inOut(Easing.quad)})),
					}}
				/>
			</AbsoluteFill>
		</AbsoluteFill>
	);
};
