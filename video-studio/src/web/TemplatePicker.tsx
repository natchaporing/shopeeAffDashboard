import React from 'react';
import {resolveTheme, type VideoStyle} from '../remotion/style';
import type {VideoTemplate} from '../shared/templates';

/** Tiny 9:16 sketch of a style: background, product card, price bar, sticker, button. */
export const StyleSwatch: React.FC<{style: VideoStyle; platform?: 'shopee' | 'lazada'; ai?: boolean; clip?: boolean}> = ({
	style,
	platform = 'shopee',
	ai,
	clip,
}) => {
	const theme = resolveTheme(style, platform);
	const background = clip
		? 'linear-gradient(160deg, #2b3a2f 0%, #6b8f71 55%, #1d2420 100%)'
		: style.background === 'photo-blur'
			? 'linear-gradient(160deg, #6b5a48 0%, #a58b6f 50%, #3b322a 100%)'
			: theme.backgroundCss;
	return (
		<div className="swatch" style={{background}} aria-hidden>
			{clip ? <span className="swatch-play">{ai ? 'AI' : '▶'}</span> : <div className="swatch-photo" />}
			<div className="swatch-card" style={{background: theme.cardBg, borderColor: theme.cardBg.startsWith('rgba') ? 'rgba(255,255,255,0.25)' : 'transparent'}}>
				<div className="swatch-line" style={{background: theme.cardMuted}} />
				<div className="swatch-price" style={{background: theme.priceOnCard}} />
			</div>
			<div className={`swatch-sticker ${style.sticker}`} style={{background: theme.accent}} />
			<div className="swatch-cta" style={{background: theme.primary}} />
		</div>
	);
};

export function templateKind(t: VideoTemplate): string {
	if (t.engine === 'slideshow') return 'Photo slideshow';
	return t.masterPrompt ? 'AI clip' : 'Your clip';
}

type Props = {
	templates: VideoTemplate[];
	selectedId: string;
	platform: 'shopee' | 'lazada';
	onSelect: (id: string) => void;
};

export const TemplatePicker: React.FC<Props> = ({templates, selectedId, platform, onSelect}) => (
	<div className="templates" role="radiogroup" aria-label="Template">
		{templates.map((t) => (
			<button
				key={t.id}
				type="button"
				role="radio"
				aria-checked={t.id === selectedId}
				className={`template${t.id === selectedId ? ' on' : ''}`}
				onClick={() => onSelect(t.id)}
			>
				<StyleSwatch style={t.style} platform={platform} clip={t.engine === 'clip'} ai={Boolean(t.masterPrompt)} />
				<span className="template-text">
					<strong>{t.name}</strong>
					{t.nameTh ? <span className="th">{t.nameTh}</span> : null}
					<span className="badges">
						<span className={`badge-kind ${t.engine}${t.masterPrompt ? ' ai' : ''}`}>{templateKind(t)}</span>
						{t.builtIn ? null : <span className="badge-custom">Custom</span>}
					</span>
				</span>
			</button>
		))}
	</div>
);
