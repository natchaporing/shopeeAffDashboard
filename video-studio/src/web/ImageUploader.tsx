import React, {useRef, useState} from 'react';
import {uploadFile} from './api';
import {LOW_RES, prepareImage} from './prepareImage';

export type UploadedImage = {
	id: string;
	/** server path used in video props, e.g. /uploads/abc.jpg */
	src: string;
	width: number;
	height: number;
	name: string;
};

type Props = {
	images: UploadedImage[];
	onChange: (next: UploadedImage[] | ((prev: UploadedImage[]) => UploadedImage[])) => void;
	max: number;
	recommended: number;
};

export const ImageUploader: React.FC<Props> = ({images, onChange, max, recommended}) => {
	const inputRef = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState(0);
	const [errors, setErrors] = useState<string[]>([]);
	const [dragOver, setDragOver] = useState(false);
	const [dragIndex, setDragIndex] = useState<number | null>(null);

	const room = max - images.length - busy;

	async function addFiles(fileList: FileList | File[]) {
		const files = [...fileList].filter((f) => f.type.startsWith('image/') || f.name);
		const accepted = files.slice(0, Math.max(0, room));
		const errs: string[] = [];
		if (files.length > accepted.length) errs.push(`Only ${max} images per video; ${files.length - accepted.length} skipped.`);
		setErrors(errs);
		setBusy((b) => b + accepted.length);

		for (const file of accepted) {
			try {
				const prepared = await prepareImage(file);
				const res = await uploadFile(prepared.blob, prepared.filename);
				onChange((prev) => [
					...prev,
					{id: res.url, src: res.url, width: prepared.width, height: prepared.height, name: file.name},
				]);
			} catch (err) {
				setErrors((e) => [...e, err instanceof Error ? err.message : String(err)]);
			} finally {
				setBusy((b) => b - 1);
			}
		}
	}

	function move(from: number, to: number) {
		if (to < 0 || to >= images.length || from === to) return;
		const next = [...images];
		const [item] = next.splice(from, 1);
		next.splice(to, 0, item);
		onChange(next);
	}

	const lowRes = images.filter((i) => Math.max(i.width, i.height) < LOW_RES);

	return (
		<div>
			<div
				className={`dropzone${dragOver ? ' over' : ''}${room <= 0 ? ' full' : ''}`}
				onClick={() => room > 0 && inputRef.current?.click()}
				onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && room > 0 && inputRef.current?.click()}
				onDragOver={(e) => {
					if (dragIndex !== null) return;
					e.preventDefault();
					setDragOver(true);
				}}
				onDragLeave={() => setDragOver(false)}
				onDrop={(e) => {
					if (dragIndex !== null) return;
					e.preventDefault();
					setDragOver(false);
					void addFiles(e.dataTransfer.files);
				}}
				role="button"
				tabIndex={0}
			>
				<input
					ref={inputRef}
					type="file"
					accept="image/jpeg,image/png,image/webp"
					multiple
					hidden
					onChange={(e) => {
						if (e.target.files) void addFiles(e.target.files);
						e.target.value = '';
					}}
				/>
				{room > 0 ? (
					<>
						<strong className="only-fine">Drop product photos here or click to choose</strong>
						<strong className="only-coarse">＋ Add photos</strong>
					</>
				) : (
					<strong>Maximum {max} photos reached</strong>
				)}
				<span>JPG, PNG or WebP · up to {max} · first photo is the cover</span>
			</div>

			{images.length > 0 || busy > 0 ? (
				<ol className="thumbs">
					{images.map((img, i) => (
						<li
							key={img.id}
							draggable
							onDragStart={() => setDragIndex(i)}
							onDragEnd={() => setDragIndex(null)}
							onDragOver={(e) => e.preventDefault()}
							onDrop={(e) => {
								e.preventDefault();
								if (dragIndex !== null) move(dragIndex, i);
								setDragIndex(null);
							}}
							className={dragIndex === i ? 'dragging' : ''}
							title={`${img.name} · ${img.width}×${img.height}`}
						>
							<img src={img.src} alt={img.name} />
							<span className="badge">{i === 0 ? 'Cover' : i + 1}</span>
							{Math.max(img.width, img.height) < LOW_RES ? <span className="warn-dot" title="Low resolution" /> : null}
							<div className="thumb-actions">
								<button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="Move left">
									‹
								</button>
								<button type="button" onClick={() => onChange(images.filter((_, j) => j !== i))} aria-label="Remove">
									×
								</button>
								<button type="button" onClick={() => move(i, i + 1)} disabled={i === images.length - 1} aria-label="Move right">
									›
								</button>
							</div>
						</li>
					))}
					{Array.from({length: busy}, (_, i) => (
						<li key={`busy-${i}`} className="uploading">
							<span>Uploading…</span>
						</li>
					))}
				</ol>
			) : null}

			{images.length > 0 && images.length < recommended ? (
				<p className="hint">
					{images.length} image{images.length > 1 ? 's' : ''}: works, the template adds zoomed detail shots. {recommended}+ different angles look best.
				</p>
			) : null}
			{lowRes.length ? (
				<p className="hint warn">
					{lowRes.length} image{lowRes.length > 1 ? 's are' : ' is'} under {LOW_RES}px and may look blurry.
				</p>
			) : null}
			{errors.map((e, i) => (
				<p key={i} className="hint error">
					{e}
				</p>
			))}
		</div>
	);
};
