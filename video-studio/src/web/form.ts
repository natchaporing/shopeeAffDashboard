import type {ProductVideoInput} from '../remotion/schema';
import {mediaFingerprint} from '../shared/rights';
import {BUILT_IN_TEMPLATES, type VideoTemplate} from '../shared/templates';
import type {UploadedImage} from './ImageUploader';

export type UploadedClip = {
	src: string;
	name: string;
	durationInSeconds: number;
	width?: number;
	height?: number;
	keepAudio: boolean;
};

export type Form = {
	platform: 'shopee' | 'lazada';
	affiliateLink: string;
	title: string;
	hook: string;
	price: string;
	originalPrice: string;
	rating: string;
	sold: string;
	hidePrice: boolean;
	cta: string;
	ctaSub: string;
	images: UploadedImage[];
	music?: {src: string; name: string};
	templateId: string;
	/** clip templates: your footage or the AI clip made from the master prompt */
	clip?: UploadedClip;
	/** AI templates: product described in English for the video model, and option picks */
	productEn: string;
	choices: Record<string, string>;
	/** media fingerprint at the moment the permission box was ticked ('' = not ticked) */
	rightsFor: string;
};

export const DEFAULT_TEMPLATE_ID = BUILT_IN_TEMPLATES[0].id;

export const EMPTY_FORM: Form = {
	platform: 'shopee',
	affiliateLink: '',
	title: '',
	hook: 'ของมันต้องมี!',
	price: '',
	originalPrice: '',
	rating: '',
	sold: '',
	hidePrice: false,
	cta: 'กดตะกร้าเลย',
	ctaSub: 'ลิงก์อยู่ในไบโอ',
	images: [],
	templateId: DEFAULT_TEMPLATE_ID,
	productEn: '',
	choices: {},
	rightsFor: '',
};

export const SAMPLE_IMAGES: UploadedImage[] = [1, 2, 3, 4].map((n) => ({
	id: `sample-${n}`,
	src: `/samples/product-${n}.jpg`,
	width: 1000,
	height: 1000,
	name: `sample ${n}`,
}));

export const SAMPLE_FORM: Form = {
	...EMPTY_FORM,
	affiliateLink: 'https://s.shopee.co.th/example',
	title: '【พร้อมส่ง】เซรั่มวิตามินซี ผิวกระจ่างใส 30ml [ของแท้100%] ลดฝ้า กระ จุดด่างดำ',
	price: '289',
	originalPrice: '590',
	rating: '4.9',
	sold: '12340',
	images: SAMPLE_IMAGES,
	productEn: 'vitamin C face serum in an amber glass dropper bottle',
};

export const HOOKS = ['ของมันต้องมี!', 'ลดแรงมาก!', 'ของดีบอกต่อ', 'ใครยังไม่มีต้องดู', 'ปังมาก!'];

export function formFingerprint(f: Pick<Form, 'images' | 'clip'>): string {
	return mediaFingerprint({images: f.images, clipSrc: f.clip?.src});
}

/** The tick only counts for the photos / clip that were there when it was ticked. */
export function rightsConfirmed(f: Form): boolean {
	return f.rightsFor !== '' && f.rightsFor === formFingerprint(f);
}

/** "1,290" / "฿1290" / " 1290 " -> 1290; "" -> undefined; junk -> NaN (fails validation). */
export function parseNumber(s: string): number | undefined {
	const cleaned = s.replace(/[,\s฿]/g, '');
	if (!cleaned) return undefined;
	const n = Number(cleaned);
	return Number.isFinite(n) ? n : NaN;
}

/** Video props for the preview / render. Style comes from the template, clip only for clip templates. */
export function toInput(f: Form, template: Pick<VideoTemplate, 'engine' | 'style'>): ProductVideoInput {
	const sold = parseNumber(f.sold);
	return {
		platform: f.platform,
		affiliateLink: f.affiliateLink,
		title: f.title,
		hook: f.hook,
		price: parseNumber(f.price) ?? 0,
		originalPrice: parseNumber(f.originalPrice),
		rating: parseNumber(f.rating),
		sold: sold === undefined ? undefined : Math.round(sold),
		hidePrice: f.hidePrice,
		cta: f.cta,
		ctaSub: f.ctaSub,
		images: f.images.map(({src, width, height}) => ({src, width, height})),
		music: f.music?.src,
		clip:
			template.engine === 'clip' && f.clip
				? {
						src: f.clip.src,
						durationInSeconds: f.clip.durationInSeconds,
						width: f.clip.width,
						height: f.clip.height,
						keepAudio: f.clip.keepAudio,
					}
				: undefined,
		style: template.style,
	};
}

/** Restore a saved draft defensively: unknown or missing keys fall back to defaults. */
export function reviveForm(raw: unknown): Form {
	if (!raw || typeof raw !== 'object') return EMPTY_FORM;
	const r = raw as Partial<Form>;
	const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d);
	const clip = r.clip && typeof r.clip.src === 'string' && typeof r.clip.durationInSeconds === 'number' ? r.clip : undefined;
	return {
		platform: r.platform === 'lazada' ? 'lazada' : 'shopee',
		affiliateLink: str(r.affiliateLink, ''),
		title: str(r.title, ''),
		hook: str(r.hook, EMPTY_FORM.hook),
		price: str(r.price, ''),
		originalPrice: str(r.originalPrice, ''),
		rating: str(r.rating, ''),
		sold: str(r.sold, ''),
		hidePrice: r.hidePrice === true,
		cta: str(r.cta, EMPTY_FORM.cta),
		ctaSub: str(r.ctaSub, EMPTY_FORM.ctaSub),
		images: Array.isArray(r.images)
			? r.images.filter((i): i is UploadedImage => !!i && typeof i.src === 'string' && typeof i.id === 'string')
			: [],
		music: r.music && typeof r.music.src === 'string' ? r.music : undefined,
		// unknown ids are kept: custom templates load from the server after the draft
		templateId: str(r.templateId, DEFAULT_TEMPLATE_ID) || DEFAULT_TEMPLATE_ID,
		clip: clip ? {...clip, keepAudio: clip.keepAudio !== false} : undefined,
		productEn: str(r.productEn, ''),
		choices:
			r.choices && typeof r.choices === 'object'
				? Object.fromEntries(Object.entries(r.choices).filter(([, v]) => typeof v === 'string'))
				: {},
		rightsFor: str(r.rightsFor, ''),
	};
}
