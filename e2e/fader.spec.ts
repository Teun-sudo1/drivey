import type { Page } from '@playwright/test';
import { advance, expect, isPhone, openApp, openParked, test } from './support';

/** The fader's slot on screen, from 0 to 10, and its housing's box. */
async function fader(page: Page) {
  await page.waitForFunction(() => window.__drivey.stage.settled);
  return page.evaluate(() => {
    const { cockpit, stage } = window.__drivey;
    stage.camera.updateMatrixWorld(true);
    const toScreen = (object: any, p: any) => {
      const v = object.localToWorld(p.clone()).project(stage.camera);
      return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (0.5 - v.y * 0.5) * innerHeight };
    };
    const [from, to] = cockpit.fader.slotEnds.map((p: any) => toScreen(cockpit.fader.face, p));
    const corners = cockpit.fader.outline.map((p: any) => toScreen(cockpit.fader.group, p));
    const xs = corners.map((c: any) => c.x), ys = corners.map((c: any) => c.y);
    return { from, to, box: { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) } };
  });
}

const at = (f: { from: { x: number; y: number }; to: { x: number; y: number } }, t: number) => ({ x: f.from.x + (f.to.x - f.from.x) * t, y: f.from.y + (f.to.y - f.from.y) * t });
const music = (page: Page) => page.evaluate(() => window.__drivey.settings.value.mix.music);

test.describe('dashboard volume fader', () => {
  test('dragging the knob sets the music volume, which the Sound tab shows and which is remembered', async ({ page }) => {
    await openApp(page);
    const f = await fader(page);
    expect(f.box.left).toBeGreaterThanOrEqual(0);
    expect(f.box.right).toBeLessThanOrEqual(page.viewportSize()!.width);
    const knob = at(f, await music(page));
    await page.mouse.move(knob.x, knob.y);
    await page.mouse.down();
    const low = at(f, 0.1);
    await page.mouse.move(low.x, low.y, { steps: 6 });
    await page.mouse.up();
    expect(await music(page)).toBeCloseTo(0.1, 1);
    await expect.poll(() => page.evaluate(() => window.__drivey.cockpit.volume)).toBeCloseTo(0.1, 1);

    // Past the end of the slot pins it to the top.
    const top = at(f, 0.95);
    await page.mouse.move(top.x, top.y);
    await page.mouse.down();
    await page.mouse.move(top.x + 200, top.y, { steps: 4 });
    await page.mouse.up();
    expect(await music(page)).toBe(1);
    await page.click('#btnPanel');
    await page.click('[data-tab="sound"]');
    await expect(page.getByLabel('Music volume', { exact: true }).first()).toHaveValue('1');

    await page.reload();
    await page.waitForFunction(() => window.__drivey);
    expect(await music(page)).toBe(1);
  });

  test('a press away from the fader changes nothing', async ({ page }) => {
    await openApp(page);
    const before = await music(page);
    const f = await fader(page);
    await page.mouse.click(f.box.left + (f.box.right - f.box.left) / 2, f.box.top - 80);
    expect(await music(page)).toBe(before);
  });

  test('the keyboard can turn it up and down', async ({ page }) => {
    test.skip(isPhone(page), 'phones have no keyboard');
    await openApp(page);
    const before = await music(page);
    await page.locator('#dashVolume').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    expect(await music(page)).toBeCloseTo(before + 0.02, 5);
  });

  test('its scale lights up with the ignition, like the gauges', async ({ page }) => {
    await openParked(page);
    await advance(page, 1);
    const backlight = () => page.evaluate(() => window.__drivey.cockpit.fader.face.material.color.r);
    expect(await backlight()).toBeLessThan(0.05);
    await page.evaluate(() => window.__drivey.startScreen.skip());
    await advance(page, 2);
    expect(await backlight()).toBeGreaterThan(0.95);
  });

  test('rain on the glass never covers it', async ({ page }) => {
    await openApp(page, { weather: 'heavy' });
    await advance(page, 4);
    await page.waitForFunction(() => window.__drivey.stage.settled);
    // Measured, drawn and read in one go, so no frame can move anything in between.
    const { inside, total } = await page.evaluate(() => {
      const { cockpit, stage, windshield } = window.__drivey;
      stage.camera.updateMatrixWorld(true);
      windshield.draw();
      const canvas = document.querySelector<HTMLCanvasElement>('#glass')!, scale = canvas.width / canvas.clientWidth;
      const corners = cockpit.fader.outline.map((p: any) => {
        const v = cockpit.fader.group.localToWorld(p.clone()).project(stage.camera);
        return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (0.5 - v.y * 0.5) * innerHeight };
      });
      // Seen at an angle the housing is a slanted quad, so take the largest box inside it, not around it,
      // inset past the clip's soft, anti-aliased edge.
      const [bl, br, tr, tl] = corners;
      const left = Math.max(bl.x, tl.x) + 4, right = Math.min(br.x, tr.x) - 4, top = Math.max(tl.y, tr.y) + 4, bottom = Math.min(bl.y, br.y) - 4;
      const x = left * scale, y = top * scale, w = (right - left) * scale, h = (bottom - top) * scale;
      const ctx = canvas.getContext('2d')!;
      const count = (d: Uint8ClampedArray) => d.reduce((n, v, i) => n + (i % 4 === 3 && v ? 1 : 0), 0);
      return { inside: count(ctx.getImageData(x, y, w, h).data), total: count(ctx.getImageData(0, 0, canvas.width, canvas.height).data) };
    });
    expect(total).toBeGreaterThan(50);
    expect(inside).toBe(0);
  });

  test('its scale stays readable when driving on the right', async ({ page }) => {
    await openApp(page, { driveSide: 'right' });
    const readable = await page.evaluate(() => {
      const face = window.__drivey.cockpit.fader.face;
      face.updateWorldMatrix(true, false);
      return face.matrixWorld.determinant() > 0;
    });
    expect(readable).toBe(true);
    // And dragging still goes the right way: further right is louder.
    const f = await fader(page);
    expect(f.to.x).toBeGreaterThan(f.from.x);
  });
});
