import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build`        -> dist/ (normal, hosteable en GitHub Pages, Netlify, etc.)
// `npm run build:single` -> dist/index.html autocontenido (un solo fichero, abrible con doble clic)
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  build: {
    target: 'es2022',
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    assetsInlineLimit: mode === 'single' ? 100_000_000 : 4096,
    cssCodeSplit: mode !== 'single',
    chunkSizeWarningLimit: 1200,
  },
}));
