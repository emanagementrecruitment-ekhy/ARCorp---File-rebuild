import { defineConfig, type Plugin } from 'vitest/config';

/**
 * Skrip klasik (IIFE) alih-alih modul: dimuat dari file:// (Electron) tanpa bergantung pada CORS modul.
 * Capacitor (https://localhost) dan browser biasa tetap berjalan sama.
 */
function classicScript(): Plugin {
  return {
    name: 'classic-script',
    enforce: 'post',
    transformIndexHtml(html) {
      return html
        .replace(/<script type="module" crossorigin src=/g, '<script defer src=')
        .replace(/<link rel="stylesheet" crossorigin /g, '<link rel="stylesheet" ');
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [classicScript()],
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: false,
    modulePreload: false,
    rollupOptions: { output: { format: 'iife', inlineDynamicImports: true } },
  },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
