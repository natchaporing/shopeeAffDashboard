/**
 * Photo / clip permission. Photos copied from a shop's listing belong to the seller or
 * brand, so every video needs the user to confirm they may use the media. The exact
 * statement and version are stored with each video as a record.
 *
 * Changing the wording? Bump `version`: drafts ticked under the old text must confirm again.
 */
export const RIGHTS = {
	version: 'v1',
	statement: 'I took these photos and clips myself, or the shop / brand that owns them gave me permission to use them in my videos.',
	statementTh: 'ฉันถ่ายภาพและคลิปเหล่านี้เอง หรือได้รับอนุญาตจากร้านค้า / แบรนด์ที่เป็นเจ้าของให้นำมาใช้ในวิดีโอแล้ว',
	warning:
		'Photos from a shop’s listing usually belong to the seller or brand. Using them in your own videos may need their permission: ask the seller, or check your affiliate program’s rules. The safest choice is photos and clips you take yourself. If an owner asks you to remove a video, remove it.',
} as const;

export type RightsRecord = {
	confirmed: true;
	version: string;
	statement: string;
	confirmedAt: string;
};

/**
 * Identifies the exact media a confirmation covers. Adding, removing or swapping a photo
 * or the clip changes it, so the user has to confirm again for the new set. Reordering
 * does not (same photos).
 */
export function mediaFingerprint(media: {images: Array<{src: string}>; clipSrc?: string}): string {
	const photos = media.images.map((i) => i.src).sort();
	return `${RIGHTS.version}|${photos.join(',')}|${media.clipSrc ?? ''}`;
}
