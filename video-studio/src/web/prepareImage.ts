export type PreparedImage = {
	blob: Blob;
	width: number;
	height: number;
	filename: string;
};

export const MAX_SIDE = 2160;
export const LOW_RES = 600;

/**
 * Normalise an image in the browser before upload: apply EXIF rotation, cap the
 * longest side at 2160px and re-encode (PNG stays PNG to keep transparency for
 * cut-outs; everything else becomes JPEG). Keeps uploads small and avoids sideways
 * phone photos.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
	if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
		throw new Error(
			`${file.name}: ${file.type || 'unknown type'} is not supported. Use JPG, PNG or WebP (iPhone HEIC: share/export as JPG).`,
		);
	}
	const bitmap = await createImageBitmap(file, {imageOrientation: 'from-image'});
	const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
	const width = Math.round(bitmap.width * scale);
	const height = Math.round(bitmap.height * scale);

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas not available');
	ctx.drawImage(bitmap, 0, 0, width, height);
	bitmap.close();

	const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
	const blob = await new Promise<Blob>((resolve, reject) =>
		canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(`Could not encode ${file.name}`))), type, 0.9),
	);
	const base = file.name.replace(/\.[^.]+$/, '') || 'image';
	return {blob, width, height, filename: `${base}.${type === 'image/png' ? 'png' : 'jpg'}`};
}
