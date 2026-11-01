/** Pure text / number helpers shared by templates, the caption builder and tests. */

/** ฿1,290 or ฿1,290.50 (no decimals when the price is whole). */
export function formatBaht(value: number): string {
	const whole = Number.isInteger(value);
	return (
		'฿' +
		value.toLocaleString('en-US', {
			minimumFractionDigits: whole ? 0 : 2,
			maximumFractionDigits: 2,
		})
	);
}

/** Discount as a whole percent, or null when there is no real discount. */
export function discountPercent(price: number, originalPrice?: number): number | null {
	if (!originalPrice || originalPrice <= price) return null;
	const pct = Math.round((1 - price / originalPrice) * 100);
	return pct >= 1 ? pct : null;
}

/** 12345 -> "12.3k", 1500000 -> "1.5M", 950 -> "950". */
export function formatCount(n: number): string {
	if (n >= 1_000_000) return trimZero((n / 1_000_000).toFixed(1)) + 'M';
	if (n >= 1_000) return trimZero((n / 1_000).toFixed(1)) + 'k';
	return String(n);
}

function trimZero(s: string): string {
	return s.endsWith('.0') ? s.slice(0, -2) : s;
}

/**
 * Marketplace titles are keyword-stuffed: "【พร้อมส่ง】[ของแท้100%] หูฟังบลูทูธ TWS ...".
 * Strip bracketed tags, collapse whitespace and cut on a word boundary so the
 * title fits two lines on screen.
 */
export function cleanTitle(raw: string, maxLength = 48): string {
	let t = raw
		.replace(/【[^】]*】/g, ' ')
		.replace(/\[[^\]]*\]/g, ' ')
		.replace(/「[^」]*」/g, ' ')
		.replace(/[|｜]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	if (!t) t = raw.trim();
	if (t.length <= maxLength) return t;
	const cut = t.slice(0, maxLength);
	const lastSpace = cut.lastIndexOf(' ');
	return (lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}
