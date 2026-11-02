import { defineConfig } from 'vitest/config';
import { serviceWorker } from './tools/serviceWorker.ts';

export default defineConfig({
  // Relative asset paths so the same build loads inside a Capacitor webview.
  base: './',
  plugins: [serviceWorker()],
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] }
});
