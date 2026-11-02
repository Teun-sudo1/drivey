import { expect, openParked, test, waitForFrames } from './support';

test.describe('installable app', () => {
  test('the manifest and every icon it names load', async ({ page, request }) => {
    await openParked(page);
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    const manifestUrl = new URL(href!, page.url());
    const manifest = await (await request.get(manifestUrl.href)).json();
    expect(manifest).toMatchObject({ name: 'Drivey', start_url: './', display: 'fullscreen' });
    expect(manifest.icons.map((i: { purpose?: string }) => i.purpose ?? 'any')).toEqual(['any', 'any', 'maskable']);
    const icons = [...manifest.icons.map((i: { src: string }) => i.src), 'favicon.svg', 'icons/apple-touch-icon.png'];
    for (const src of icons) {
      const response = await request.get(new URL(src, manifestUrl).href);
      expect(response.status(), src).toBe(200);
      // A missing file would come back as the page itself, also with a 200.
      expect(response.headers()['content-type'], src).toMatch(/^image\//);
    }
  });
});

test.describe('offline', () => {
  test.use({ serviceWorkers: 'allow' });

  test('after one visit the app opens and drives with no network', async ({ page, context }) => {
    await openParked(page);
    // Controlled means the cache is complete: the worker only activates once every file is stored.
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

    await context.setOffline(true);
    await page.reload();
    await waitForFrames(page);
    await expect(page.locator('#startSetup h1')).toHaveText('DRIVEY');
    // The bundled fonts came from the cache too.
    expect(await page.evaluate(async () => (await document.fonts.load('54px "Share Tech Mono"').catch(() => [])).length)).toBe(1);
    await page.evaluate(() => window.__drivey.startScreen.skip());
    await expect(page.locator('#time')).toHaveText('25:00');
  });
});
