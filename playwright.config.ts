import { defineConfig } from '@playwright/test';

const PORT = 4173;

/**
 * The everyday run covers what breaks silently (the timer, saved sessions and settings, starting up, offline use and the
 * draw-call budget) on a laptop and an upright phone, at a fan-friendly pace. E2E_FULL=1 runs every test on all four setups,
 * for big changes; the rest is checked by eye.
 */
const FULL = process.env.E2E_FULL === '1';
const CORE = ['timer', 'stats', 'session', 'offline', 'engine', 'routes'].map(name => `${name}.spec.ts`);
const CORE_SETUPS = ['laptop-chromium', 'phone-portrait'];

/** A fake sound card: parallel test browsers fighting over the real one stall each other's audio clock. */
const fakeAudio = ['--disable-audio-output'];

export default defineConfig({
  testDir: 'e2e',
  testMatch: FULL ? '*.spec.ts' : CORE,
  timeout: 60_000,
  expect: { timeout: 30_000 },
  // Measured on a 10-core Mac: 6 halves the run against 2, and more only adds contention; 3 keeps the everyday run quiet.
  workers: FULL ? 6 : 3,
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
  projects: ([
    { name: 'phone-portrait', use: { browserName: 'webkit', viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: 'phone-landscape', use: { browserName: 'webkit', viewport: { width: 844, height: 390 }, hasTouch: true } },
    { name: 'laptop-webkit', use: { browserName: 'webkit', viewport: { width: 1280, height: 800 } } },
    { name: 'laptop-chromium', use: { browserName: 'chromium', channel: 'chromium', viewport: { width: 1280, height: 800 }, launchOptions: { args: fakeAudio } } }
  ] as const).filter(p => FULL || CORE_SETUPS.includes(p.name))
});
