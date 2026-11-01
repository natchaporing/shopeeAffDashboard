import React, {useEffect, useRef, useState} from 'react';
import type {JobView} from './api';

/** Finished / failed video: player, save-or-share, download, caption with copy. */
export const JobResult: React.FC<{job: JobView}> = ({job}) => {
	const [file, setFile] = useState<File | null>(null);
	const [copied, setCopied] = useState(false);
	const [shareError, setShareError] = useState<string | null>(null);
	const captionRef = useRef<HTMLTextAreaElement>(null);

	// Fetch the MP4 ahead of time: iOS only opens the share sheet if navigator.share
	// runs right inside the tap, with no network wait in between.
	useEffect(() => {
		setFile(null);
		setCopied(false);
		if (job.status !== 'done' || !job.videoUrl || typeof navigator.canShare !== 'function') return;
		let cancelled = false;
		fetch(job.videoUrl)
			.then((r) => r.blob())
			.then((blob) => {
				const f = new File([blob], `video-${job.id.slice(0, 8)}.mp4`, {type: 'video/mp4'});
				if (!cancelled && navigator.canShare({files: [f]})) setFile(f);
			})
			.catch(() => undefined);
		return () => {
			cancelled = true;
		};
	}, [job.id, job.status, job.videoUrl]);

	async function share() {
		if (!file) return;
		setShareError(null);
		try {
			await navigator.share({files: [file]});
		} catch (err) {
			if (err instanceof Error && err.name !== 'AbortError') setShareError(err.message);
		}
	}

	async function copy() {
		try {
			// Some browsers leave writeText pending behind a permission prompt; don't wait forever.
			await Promise.race([
				navigator.clipboard.writeText(job.caption),
				new Promise((_, reject) => setTimeout(() => reject(new Error('clipboard timeout')), 1500)),
			]);
		} catch {
			// older browsers / insecure context: fall back to selecting the text
			captionRef.current?.select();
			document.execCommand('copy');
		}
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}

	return (
		<div className="job">
			{job.status === 'failed' ? <p className="hint error">Render failed: {job.error}</p> : null}
			{job.status === 'done' && job.videoUrl ? (
				<>
					<video src={`${job.videoUrl}#t=2.5`} controls playsInline preload="metadata" className="result" />
					<div className="result-actions">
						{file ? (
							<button type="button" className="primary" onClick={() => void share()}>
								Save / Share video
							</button>
						) : null}
						<a className={`primary${file ? ' ghost' : ''}`} href={job.videoUrl} download={`video-${job.id.slice(0, 8)}.mp4`}>
							Download MP4
						</a>
					</div>
					{file ? <p className="hint">Save / Share opens your phone's share menu: Save Video, TikTok, LINE…</p> : null}
					{shareError ? <p className="hint error">{shareError}</p> : null}
				</>
			) : null}
			<label>
				Caption
				<textarea ref={captionRef} readOnly rows={7} value={job.caption} />
			</label>
			<button type="button" className="secondary" onClick={() => void copy()}>
				{copied ? 'Copied ✓' : 'Copy caption'}
			</button>
		</div>
	);
};
