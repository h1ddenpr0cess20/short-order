import { defineConfig } from 'vite';

/**
 * A static page and nothing behind it. `base` is relative so the build works
 * from wherever it is put — a GitHub Pages project path as well as a root.
 */
export default defineConfig({
  base: './',
  server: { port: 5173, host: true },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 800,
  },
});
