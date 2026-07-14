// --------- vite.config.ts — webview bundle: Preact + Tailwind v4 → dist/webview --------- //

/*
 * Depends on:
 *   - @preact/preset-vite: JSX → Preact transform.
 *   - @tailwindcss/vite: Tailwind v4 (no tailwind.config / PostCSS setup needed).
 */

import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [preact(), tailwindcss()],
  build: {
    outDir: 'dist/webview',
    emptyOutDir: true,
    // The extension's HTML shell references main.js/main.css by fixed path, so output
    // must be exactly one js + one css file with hashing off — see sidePanelProvider.ts.
    cssCodeSplit: false,
    rollupOptions: {
      input: 'webview/index.tsx',
      output: {
        entryFileNames: 'main.js',
        assetFileNames: 'main[extname]',
        inlineDynamicImports: true,
      },
    },
  },
});
