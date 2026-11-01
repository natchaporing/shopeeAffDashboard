import {cleanTitle, discountPercent, formatBaht, formatCount} from '../remotion/format';
import type {ProductVideoProps} from '../remotion/schema';

const PLATFORM_TAGS: Record<ProductVideoProps['platform'], string[]> = {
	shopee: ['#shopee', '#shopeeTH', '#ช้อปปี้'],
	lazada: ['#lazada', '#lazadaTH', '#ลาซาด้า'],
};

/** Ready-to-paste post caption: hook, price, social proof, affiliate link, hashtags. */
export function buildCaption(p: ProductVideoProps): string {
	const lines: string[] = [];
	const title = cleanTitle(p.title, 80);
	lines.push(p.hook ? `${p.hook} ${title}` : title);

	const pct = discountPercent(p.price, p.originalPrice);
	if (p.hidePrice) {
		lines.push(pct ? `💥 ราคาพิเศษ ลดสูงสุด ${pct}%` : '💥 ราคาพิเศษ');
	} else if (pct && p.originalPrice) {
		lines.push(`💥 เหลือ ${formatBaht(p.price)} จาก ${formatBaht(p.originalPrice)} (ลด ${pct}%)`);
	} else {
		lines.push(`💥 ราคา ${formatBaht(p.price)}`);
	}

	const proof: string[] = [];
	if (p.rating) proof.push(`⭐ ${p.rating.toFixed(1)}`);
	if (p.sold) proof.push(`ขายแล้ว ${formatCount(p.sold)} ชิ้น`);
	if (proof.length) lines.push(proof.join(' | '));

	if (p.affiliateLink) lines.push(`🛒 พิกัด: ${p.affiliateLink}`);
	lines.push('');
	lines.push(['#ของดีบอกต่อ', '#ป้ายยา', '#รีวิว', ...PLATFORM_TAGS[p.platform]].join(' '));
	return lines.join('\n');
}
