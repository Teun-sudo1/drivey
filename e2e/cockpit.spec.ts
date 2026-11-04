import { advance, brightnessAt, expect, isPortrait, mirrorRect, openApp, openSceneTab, overlaps, test, textRect, update } from './support';
import { GAUGE_LANDMARKS } from '../src/scene/cockpit/gauges';

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
    test.skip(isPortrait(page), 'upright, the mirror hangs off to the side, as in the car');
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

test('the dashboard display is fully on screen in landscape', async ({ page }) => {
  test.skip(isPortrait(page), 'portrait crops the dashboard to a strip on purpose');
  await openApp(page);
  const edges = await page.evaluate(() => {
    const { cockpit, stage } = window.__drivey;
    stage.camera.updateMatrixWorld(true);
    const lcd = cockpit.screens[1];
    const width = lcd.geometry.parameters.width;
    return [-width / 2, width / 2].map(x => lcd.localToWorld(stage.camera.position.clone().set(x, 0, 0)).project(stage.camera).x);
  });
  expect(Math.min(...edges)).toBeGreaterThan(-1);
  expect(Math.max(...edges)).toBeLessThan(1);
});

test('the wheel frames the gauges without covering the dials or the speed', async ({ page }) => {
  await openApp(page, { tod: 'day', weather: 'clear' });
  await advance(page, 2);
  await page.waitForFunction(() => window.__drivey.stage.settled);
  const points = await page.evaluate(landmarks => {
    const { cockpit, stage } = window.__drivey;
    stage.camera.updateMatrixWorld(true);
    const screen = cockpit.gaugeScreen, { width, height } = screen.geometry.parameters, map = screen.material.map.image;
    return landmarks.map(({ x, y }: { x: number; y: number }) => {
      const v = screen.localToWorld(stage.camera.position.clone().set((x / map.width - 0.5) * width, (0.5 - y / map.height) * height, 0)).project(stage.camera);
      return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (0.5 - v.y * 0.5) * innerHeight };
    });
  }, GAUGE_LANDMARKS);
  // Hold the readings still, so only the wheel differs between the two samples.
  await page.evaluate(() => (window.__drivey.cockpit.gauges.draw = () => {}));
  const { width, height } = page.viewportSize()!;
  for (const p of points) {
    expect(p.x).toBeGreaterThan(4);
    expect(p.x).toBeLessThan(width - 4);
    expect(p.y).toBeGreaterThan(4);
    expect(p.y).toBeLessThan(height - 6);
  }
  const sample = () => Promise.all(points.map(p => brightnessAt(page, p.x, p.y, 3)));
  const shown = await sample();
  await page.evaluate(() => (window.__drivey.cockpit.wheel.visible = false));
  const hidden = await sample();
  shown.forEach((b, i) => expect(Math.abs(b - hidden[i]), `landmark ${i}`).toBeLessThan(1.5));
});

test('sat back, the gear lever shows on the console', async ({ page }) => {
  test.skip(isPortrait(page), 'upright, the console is out of view below the wheel');
  await openApp(page, { tod: 'day', weather: 'clear' });
  await advance(page, 2);
  await page.waitForFunction(() => window.__drivey.stage.settled);
  const { knob, radius, radio } = await page.evaluate(() => {
    const { cockpit, stage } = window.__drivey;
    stage.camera.updateMatrixWorld(true);
    const toScreen = (object: any, p: any) => {
      const v = object.localToWorld(p.clone()).project(stage.camera);
      return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (0.5 - v.y * 0.5) * innerHeight };
    };
    const ball = cockpit.gearLever.children[2];
    const centre = toScreen(ball, ball.position.clone().set(0, 0, 0));
    const r = ball.geometry.parameters.radius;
    const side = toScreen(ball, ball.position.clone().set(r, 0, 0));
    const corners = cockpit.radio.outline.map((p: any) => toScreen(cockpit.radio.group, p));
    const xs = corners.map((c: any) => c.x), ys = corners.map((c: any) => c.y);
    return {
      knob: centre,
      radius: Math.abs(side.x - centre.x),
      radio: { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) }
    };
  });
  // All of it is in view, below the radio and left of the wheel's hub.
  expect(knob.y + radius).toBeLessThan(page.viewportSize()!.height);
  expect(knob.x + radius < radio.left || knob.y - radius > radio.bottom || knob.x - radius > radio.right).toBe(true);
  expect(knob.x).toBeLessThan(page.viewportSize()!.width / 2);
  // And nothing in front hides it: drawing it changes what's there, where hidden it changes nothing.
  const at = { x: knob.x, y: knob.y - radius * 0.3 };
  const shown = await brightnessAt(page, at.x, at.y, radius * 0.3);
  await page.evaluate(() => (window.__drivey.cockpit.gearLever.visible = false));
  const hidden = await brightnessAt(page, at.x, at.y, radius * 0.3);
  expect(Math.abs(shown - hidden)).toBeGreaterThan(3);
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
      lane: roadSurface.lanes.value.x,
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
    expect(turned).toBeCloseTo(-0.09, 5);
  });

  test('the mirror stays clear of the HUD on the right too', async ({ page }) => {
    test.skip(isPortrait(page), 'upright, the mirror hangs off to the side, as in the car');
    await openApp(page, { driveSide: 'right' });
    const mirror = await mirrorRect(page), size = page.viewportSize()!;
    expect(mirror.left).toBeGreaterThanOrEqual(0);
    expect(mirror.right).toBeLessThanOrEqual(size.width);
    expect(overlaps(mirror, await textRect(page, '#time'))).toBe(false);
    expect(overlaps(mirror, await rectOf(page, '#btnFull'))).toBe(false);
  });
});

test('dragging the view looks round the car, and the look-ahead button faces forward again', async ({ page }) => {
  await openApp(page, { tod: 'day', weather: 'clear' });
  const look = () => page.evaluate(() => window.__drivey.stage.look.yaw);
  await expect(page.locator('#btnLook')).toBeHidden();
  const { width, height } = page.viewportSize()!;
  await page.mouse.move(width * 0.5, height * 0.3);
  await page.mouse.down();
  await page.mouse.move(width * 0.5 + 80, height * 0.3, { steps: 4 });
  await page.mouse.up();
  expect(await look()).toBeGreaterThan(0.2);
  await page.click('#btnLook');
  expect(await look()).toBe(0);
  await expect(page.locator('#btnLook')).toBeHidden();
});

test('the A/C comes on by itself in rain, and off again when it clears', async ({ page }) => {
  await openApp(page, { weather: 'clear' });
  const airCon = () => page.evaluate(() => window.__drivey.windshield.airCon);
  await advance(page, 1);
  expect(await airCon()).toBe(false);
  await update(page, { weather: 'rain' });
  await advance(page, 1);
  expect(await airCon()).toBe(true);
  await update(page, { weather: 'clear' });
  await advance(page, 1);
  expect(await airCon()).toBe(false);
});
