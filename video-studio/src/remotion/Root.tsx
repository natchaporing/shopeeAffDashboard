import React from 'react';
import {Composition, staticFile} from 'remotion';
import type {ProductVideoProps} from './schema';
import {TEMPLATES} from './templates/registry';

/** Sample props so `npm run studio` opens with something to look at. */
export const SAMPLE_PROPS: ProductVideoProps = {
	platform: 'shopee',
	affiliateLink: 'https://s.shopee.co.th/example',
	title: '【พร้อมส่ง】เซรั่มวิตามินซี ผิวกระจ่างใส 30ml [ของแท้100%] ลดฝ้า กระ จุดด่างดำ',
	hook: 'ของมันต้องมี!',
	price: 289,
	originalPrice: 590,
	rating: 4.9,
	sold: 12_340,
	hidePrice: false,
	cta: 'กดตะกร้าเลย',
	ctaSub: 'ลิงก์อยู่ในไบโอ',
	images: [1, 2, 3, 4].map((n) => ({src: staticFile(`samples/product-${n}.jpg`)})),
};

export const RemotionRoot: React.FC = () => (
	<>
		{TEMPLATES.map((t) => (
			<Composition
				key={t.id}
				id={t.id}
				component={t.component}
				width={t.width}
				height={t.height}
				fps={t.fps}
				durationInFrames={t.durationInFrames(SAMPLE_PROPS)}
				defaultProps={SAMPLE_PROPS}
				calculateMetadata={({props}) => ({durationInFrames: t.durationInFrames(props)})}
			/>
		))}
	</>
);
