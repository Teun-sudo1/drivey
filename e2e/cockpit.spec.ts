import { advance, expect, isPortrait, mirrorRect, openApp, openSceneTab, overlaps, test, textRect, update } from './support';

const rectOf = async (page: any, selector: string) => {
  const b = (await page.locator(selector).boundingBox())!;
  return { left: b.x, right: b.x + b.width, top: b.y, bottom: b.y + b.height };
};

/** Mean colour of part of the mirror's own canvas. */
const mirrorRegion = (page: any, x: number, y: number, w: number, h: number) => page.evaluate(([x, y, w, h]: number[]) => {
  const d = window.__drivey.cockpit.mirror.ctx.getImageData(x, y, w, h).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
  return sum / (d.length / 4);
}, [x, y, w, h]);

test.describe('rear-view mirror', () => {
  test('is fully on screen and clear of the HUD', async ({ page }) => {
    await openApp(page);
    const mirror = await mirrorRect(page), size = page.viewportSize()!;
    expect(mirror.left).toBeGreaterThanOrEqual(0);
    expect(mirror.right).toBeLessThanOrEqual(size.width);
    expect(mirror.top).toBeGreaterThanOrEqual(0);
    expect(mirror.bottom).toBeLessThanOrEqual(size.height);

    expect(overlaps(mirror, await textRect(page, '#time'))).toBe(false);
    expect(overlaps(mirror, await rectOf(page, '#chip'))).toBe(false);
    expect(overlaps(mirror, await rectOf(page, '#btnFull'))).toBe(false);
    if (isPortrait(page)) expect(mirror.top).toBeGreaterThanOrEqual((await rectOf(page, '#top')).bottom);
  });

  test('keeps its place on a shorter phone screen', async ({ page }) => {
    test.skip(!isPortrait(page), 'portrait only');
    await page.setViewportSize({ width: 390, height: 664 });
    await openApp(page);
    const mirror = await mirrorRect(page);
    expect(mirror.top).toBeGreaterThanOrEqual((await rectOf(page, '#top')).bottom);
    expect(overlaps(mirror, await textRect(page, '#time'))).toBe(false);
  });

  test('shows the weather behind the car', async ({ page }) => {
    await openApp(page, { tod: 'night', weather: 'clear' });
    const road = () => mirrorRegion(page, 130, 62, 60, 8);
    await expect.poll(road).toBeGreaterThan(0);
    const dry = await road();

    await update(page, { weather: 'snow' });
    await advance(page, 10);
    await expect.poll(road).toBeGreaterThan(dry + 40);
    await expect.poll(() => page.evaluate(() => window.__drivey.cockpit.mirror.snow)).toBeGreaterThan(0.9);

    await update(page, { weather: 'rain' });
    await advance(page, 10);
    await expect.poll(() => page.evaluate(() => window.__drivey.cockpit.mirror.rain)).toBeGreaterThan(0.4);
    await update(page, { weather: 'fog' });
    await advance(page, 10);
    await expect.poll(() => page.evaluate(() => window.__drivey.cockpit.mirror.fogVeil)).toBeGreaterThan(0.5);
  });

  test('its reflection keeps moving', async ({ page }) => {
    await openApp(page, { tod: 'night', weather: 'clear' });
    const frame = () => page.evaluate(() => window.__drivey.cockpit.mirror.ctx.canvas.toDataURL());
    const first = await frame();
    await advance(page, 1);
    expect(await frame()).not.toBe(first);
  });
});

test.describe('driving side', () => {
  const state = (page: any) => page.evaluate(() => {
    const { pool, cockpit, roadSurface, windshield, stage } = window.__drivey;
    stage.scene.updateMatrixWorld(true);
    return {
      chunkScale: pool.chunks[0].group.scale.x,
      labelsReadable: pool.chunks.every((c: any) => c.labels.every((l: any) => l.matrixWorld.determinant() > 0)),
      hasLabels: pool.chunks.some((c: any) => c.labels.length > 0),
      interiorScale: cockpit.root.scale.x,
      screensReadable: cockpit.screens.every((s: any) => s.matrixWorld.determinant() > 0),
      lane: roadSurface.laneCentres.value.x,
      mirrored: windshield.mirrored
    };
  });

  test('defaults to the left, as the right-hand-drive car was built', async ({ page }) => {
    await page.goto('./');
    await page.waitForFunction(() => window.__drivey?.drive.clock > 0.1);
    await expect(page.locator('#segSide button:has-text("Left")')).toHaveAttribute('aria-pressed', 'true');
    expect(await state(page)).toMatchObject({ chunkScale: 1, interiorScale: 1, lane: -0.4, mirrored: false, labelsReadable: true, screensReadable: true });
  });

  test('choosing right mirrors the road and car, keeps text readable, and persists', async ({ page }) => {
    await openApp(page);
    const before = await mirrorRect(page);
    await openSceneTab(page);
    await page.click('#segSide button:has-text("Right")');
    await expect(page.locator('#segSide button:has-text("Right")')).toHaveAttribute('aria-pressed', 'true');
    await page.click('#btnClose');

    await expect.poll(async () => (await state(page)).mirrored).toBe(true);
    const right = await state(page);
    expect(right).toMatchObject({ chunkScale: -1, interiorScale: -1, lane: 0.4, labelsReadable: true, hasLabels: true, screensReadable: true });

    // The mirror crosses to the other side of the car.
    const after = await mirrorRect(page), center = page.viewportSize()!.width / 2;
    expect(Math.sign((after.left + after.right) / 2 - center)).toBe(-Math.sign((before.left + before.right) / 2 - center));

    await page.reload();
    await page.waitForFunction(() => window.__drivey?.drive.clock > 0.1);
    await expect.poll(async () => (await state(page)).chunkScale).toBe(-1);

    await update(page, { driveSide: 'left' });
    expect(await state(page)).toMatchObject({ chunkScale: 1, interiorScale: 1, lane: -0.4 });
  });

  test('the wheel still turns into the curve', async ({ page }) => {
    await openApp(page, { driveSide: 'right' });
    const turned = await page.evaluate(() => {
      const { cockpit } = window.__drivey;
      cockpit.steer(0.0002);
      return cockpit.wheel.rotation.z;
    });
    expect(turned).toBeCloseTo(-0.18, 5);
  });

  test('the mirror stays clear of the HUD on the right too', async ({ page }) => {
    await openApp(page, { driveSide: 'right' });
    const mirror = await mirrorRect(page), size = page.viewportSize()!;
    expect(mirror.left).toBeGreaterThanOrEqual(0);
    expect(mirror.right).toBeLessThanOrEqual(size.width);
    expect(overlaps(mirror, await textRect(page, '#time'))).toBe(false);
    expect(overlaps(mirror, await rectOf(page, '#btnFull'))).toBe(false);
  });
});
