import { defineConfig } from '@playwright/test';

const PORT = 4173;
const softwareWebGl = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

/** A fake sound card: parallel test browsers fighting over the real one stall each other's audio clock. */
const fakeAudio = ['--disable-audio-output'];

export default defineConfig({
  testDir: 'e2e',
  // Software rendering is slow, and every open page competes for the same CPU.
  timeout: 120_000,
  expect: { timeout: 60_000 },
  workers: 2,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: `npm run build:e2e && npx vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  projects: [
    { name: 'phone-portrait', use: { browserName: 'webkit', viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: 'phone-landscape', use: { browserName: 'webkit', viewport: { width: 844, height: 390 }, hasTouch: true } },
    { name: 'laptop-webkit', use: { browserName: 'webkit', viewport: { width: 1280, height: 800 } } },
    { name: 'laptop-chromium', use: { browserName: 'chromium', channel: 'chromium', viewport: { width: 1280, height: 800 }, launchOptions: { args: [...(process.env.CI ? softwareWebGl : []), ...fakeAudio] } } }
  ]
});
