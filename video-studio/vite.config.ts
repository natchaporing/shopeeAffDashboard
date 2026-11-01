import path from 'node:path';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

const root = path.resolve(import.meta.dirname, 'src/web');

export default defineConfig({
	root,
	// fonts/ and samples/ are shared with the Remotion bundle
	publicDir: path.resolve(import.meta.dirname, 'public'),
	plugins: [react()],
	build: {
		outDir: path.resolve(import.meta.dirname, 'dist/web'),
		emptyOutDir: true,
	},
});
