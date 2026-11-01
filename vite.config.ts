import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths so the same build loads inside a Capacitor webview.
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] }
});
