import {ALL_FORMATS, FilePathSource, Input} from 'mediabunny';

export type VideoInfo = {durationInSeconds: number; width?: number; height?: number};

/** Duration and size of a local video file, read from its container (no decoding). */
export async function probeVideo(filePath: string): Promise<VideoInfo> {
	const input = new Input({formats: ALL_FORMATS, source: new FilePathSource(filePath)});
	try {
		const durationInSeconds = await input.computeDuration();
		const track = await input.getPrimaryVideoTrack();
		if (!track) throw new Error('No video track found in the file');
		return {
			durationInSeconds: Math.round(durationInSeconds * 1000) / 1000,
			width: track.displayWidth,
			height: track.displayHeight,
		};
	} finally {
		input.dispose();
	}
}
