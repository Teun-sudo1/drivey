import { RELEASES } from '../src/app/whatsNew';
import { brightnessAt, expect, isPortrait, openApp, openParked, test } from './support';

test.describe('layout', () => {
  test('the scene renders and the first frame runs forwards', async ({ page }) => {
    await openApp(page);
    // A negative first time step once threw the car 45 m backwards, leaving a gap in the road.
    const state = await page.evaluate(() => {
      const { drive, pool } = window.__drivey;
      return { clock: drive.clock, nearest: Math.max(...pool.chunks.map((c: any) => c.group.position.z)) };
    });
    expect(state.clock).toBeGreaterThan(0);
    expect(state.nearest).toBeGreaterThanOrEqual(0);

    const size = page.viewportSize()!;
    expect(await brightnessAt(page, size.width / 2, size.height * 0.35, size.height * 0.3)).toBeGreaterThan(1);
  });

  test('settings open as a bottom sheet in portrait and a side panel in landscape', async ({ page }) => {
    await openApp(page);
    const panel = page.locator('#panel');
    await expect(panel).toHaveAttribute('inert', '');
    await page.click('#btnPanel');
    await expect(panel).not.toHaveAttribute('inert', '');
    // The slide-in can lag far behind on a slow machine.
    const size = page.viewportSize()!;
    await expect.poll(async () => {
      const b = (await panel.boundingBox())!;
      return Math.abs(b.y + b.height - size.height) + Math.abs(b.x + b.width - size.width);
    }).toBeLessThan(2);

    const box = (await panel.boundingBox())!;
    if (isPortrait(page)) {
      expect(box.width).toBeGreaterThanOrEqual(size.width - 1);
      expect(Math.abs(box.y + box.height - size.height)).toBeLessThan(2);
    } else {
      expect(box.height).toBeGreaterThanOrEqual(size.height - 1);
      expect(Math.abs(box.x + box.width - size.width)).toBeLessThan(2);
      expect(box.width).toBeLessThan(size.width);
    }
    await page.click('#btnClose');
    await expect(panel).toHaveAttribute('inert', '');
  });

  test('the camera frames each orientation and rotating eases between them', async ({ page }) => {
    await openApp(page);
    const size = page.viewportSize()!;
    const fov = () => page.evaluate(() => window.__drivey.stage.camera.fov);
    // Sat back, as every screen starts; upright widens the view to make up for the narrow screen.
    const landscapeFov = 72;
    const startFov = isPortrait(page) ? 70 : landscapeFov, otherFov = isPortrait(page) ? landscapeFov : 70;
    expect(await fov()).toBeCloseTo(startFov, 1);

    await page.setViewportSize({ width: size.height, height: size.width });
    await expect.poll(fov).toBeCloseTo(otherFov, 1);
    const canvas = await page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>('#gl')!;
      return { w: c.clientWidth, h: c.clientHeight };
    });
    expect(canvas).toEqual({ w: size.height, h: size.width });
  });

  test('in landscape the buttons on the right line up in one column', async ({ page }) => {
    test.skip(isPortrait(page), 'upright, the controls sit in a row at the bottom');
    await openApp(page);
    // The fullscreen button is left out where it's hidden.
    const centres = await page.evaluate(() => ['#btnPlay', '#btnFull', '#btnReset', '#btnSkip', '#btnPanel'].flatMap(sel => {
      const r = document.querySelector(sel)!.getBoundingClientRect();
      return r.width ? [r.left + r.width / 2] : [];
    }));
    expect(centres.length).toBeGreaterThanOrEqual(4);
    for (const x of centres) expect(Math.abs(x - centres[0])).toBeLessThan(1);
  });

  test('the fullscreen button only shows where fullscreen works', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('#btnFull')).toBeVisible();
    // iPhone Safari, and a native shell's web view, have none.
    await page.addInitScript(() => Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false }));
    await page.reload();
    await page.evaluate(() => window.__drivey.startScreen.skip());
    await expect(page.locator('#btnPanel')).toBeVisible();
    await expect(page.locator('#btnFull')).toBeHidden();
  });

  test('graphics toggles reach the page', async ({ page }) => {
    await openApp(page, { grain: true, vignette: true, reduced: false });
    await page.click('#btnPanel');
    await page.click('[data-tab="scene"]');
    await page.click('.tog[data-k="grain"]');
    await expect(page.locator('body')).toHaveClass(/nograin/);
    await page.click('.tog[data-k="vignette"]');
    await expect(page.locator('body')).toHaveClass(/novignette/);
    await page.click('.tog[data-k="reduced"]');
    await expect(page.locator('body')).toHaveClass(/reduced/);
  });
});

test('the opening screen tells the latest release, and Stats lists them all', async ({ page }) => {
  await openParked(page);
  await expect(page.locator('#introNews')).toContainText(RELEASES[0].notes);
  await page.evaluate(() => window.__drivey.startScreen.skip());
  await page.click('#btnPanel');
  await page.click('[data-tab="stats"]');
  await expect(page.locator('#changelog li')).toHaveCount(RELEASES.length);
});
