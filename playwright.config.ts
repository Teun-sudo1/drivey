import { defineConfig } from '@playwright/test';

const PORT = 4173;

/** A fake sound card: parallel test browsers fighting over the real one stall each other's audio clock. */
const fakeAudio = ['--disable-audio-output'];

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 30_000 },
  // Measured on a 10-core Mac: 6 halves the run against 2, and more only adds contention.
  workers: 6,
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    screenshot: 'only-on-failure',
    // Each test is a fresh visitor; only the offline test lets the app install its cache.
    serviceWorkers: 'block'
  },
  webServer: {
    command: `npm run build:e2e && npx vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 60_000
  },
  projects: [
    { name: 'phone-portrait', use: { browserName: 'webkit', viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: 'phone-landscape', use: { browserName: 'webkit', viewport: { width: 844, height: 390 }, hasTouch: true } },
    { name: 'laptop-webkit', use: { browserName: 'webkit', viewport: { width: 1280, height: 800 } } },
    { name: 'laptop-chromium', use: { browserName: 'chromium', channel: 'chromium', viewport: { width: 1280, height: 800 }, launchOptions: { args: fakeAudio } } }
  ]
});
