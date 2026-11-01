import React from 'react';
import {Composition, Folder, staticFile} from 'remotion';
import {ENGINES} from './engines';
import {productVideoSchema, type ProductVideoProps} from './schema';
import {BUILT_IN_TEMPLATES} from '../shared/templates';

/** Sample product so `npm run studio` opens with something to look at. */
const SAMPLE: Omit<ProductVideoProps, 'style'> = productVideoSchema.parse({
	platform: 'shopee',
	affiliateLink: 'https://s.shopee.co.th/example',
	title: '【พร้อมส่ง】เซรั่มวิตามินซี ผิวกระจ่างใส 30ml [ของแท้100%] ลดฝ้า กระ จุดด่างดำ',
	hook: 'ของมันต้องมี!',
	price: 289,
	originalPrice: 590,
	rating: 4.9,
	sold: 12_340,
	images: [1, 2, 3, 4].map((n) => ({src: staticFile(`samples/product-${n}.jpg`)})),
});

/**
 * One composition per engine (the ids the server renders) plus, in a folder, one per
 * built-in template so every preset can be checked in the Studio.
 */
export const RemotionRoot: React.FC = () => (
	<>
		{Object.values(ENGINES).map((engine) => {
			const defaultProps = {...SAMPLE, style: BUILT_IN_TEMPLATES.find((t) => t.engine === engine.id)!.style};
			return (
				<Composition
					key={engine.id}
					id={engine.id}
					component={engine.component}
					width={engine.width}
					height={engine.height}
					fps={engine.fps}
					durationInFrames={engine.durationInFrames(defaultProps)}
					defaultProps={defaultProps}
					calculateMetadata={({props}) => ({durationInFrames: engine.durationInFrames(props)})}
				/>
			);
		})}
		<Folder name="templates">
			{BUILT_IN_TEMPLATES.map((t) => {
				const engine = ENGINES[t.engine];
				const defaultProps = {...SAMPLE, style: t.style};
				return (
					<Composition
						key={t.id}
						id={`t-${t.id}`}
						component={engine.component}
						width={engine.width}
						height={engine.height}
						fps={engine.fps}
						durationInFrames={engine.durationInFrames(defaultProps)}
						defaultProps={defaultProps}
						calculateMetadata={({props}) => ({durationInFrames: engine.durationInFrames(props)})}
					/>
				);
			})}
		</Folder>
	</>
);
