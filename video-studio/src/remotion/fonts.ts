import {cancelRender, continueRender, delayRender, staticFile} from 'remotion';

/**
 * Kanit (SIL Open Font License) shipped in public/fonts, so renders never depend on
 * Google Fonts being reachable. Thai and Latin subsets are registered under one
 * family with unicode ranges, exactly like the @fontsource CSS does.
 */
export const FONT_FAMILY = 'Kanit, "Noto Sans Thai", sans-serif';

const THAI_RANGE = 'U+02D7,U+0303,U+0331,U+0E01-0E5B,U+200C-200D,U+25CC';
const LATIN_RANGE =
	'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';

const WEIGHTS = [400, 600, 800] as const;

let started = false;

export function loadFonts(): void {
	if (started || typeof document === 'undefined' || typeof FontFace === 'undefined') return;
	started = true;

	const handle = delayRender('Loading Kanit font');
	const faces = WEIGHTS.flatMap((weight) =>
		(
			[
				['thai', THAI_RANGE],
				['latin', LATIN_RANGE],
			] as const
		).map(
			([subset, range]) =>
				new FontFace('Kanit', `url(${staticFile(`fonts/kanit-${subset}-${weight}-normal.woff2`)}) format('woff2')`, {
					weight: String(weight),
					unicodeRange: range,
				}),
		),
	);

	Promise.all(
		faces.map((face) =>
			face.load().then((loaded) => {
				document.fonts.add(loaded);
			}),
		),
	)
		.then(() => continueRender(handle))
		.catch((err) => cancelRender(err));
}
