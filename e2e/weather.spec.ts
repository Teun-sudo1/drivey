import { advance, brightnessAt, expect, glassPixels, isPortrait, mirrorInnerRect, openApp, openSceneTab, screenOf, test, update } from './support';

test.describe('time of day and weather controls', () => {
  test('choosing them updates the label, saves and blends gradually', async ({ page }) => {
    await openApp(page, { tod: 'night', weather: 'clear' });
    await openSceneTab(page);
    await page.click('#segTod button:has-text("Dusk")');
    await page.click('#segWeather button:has-text("Heavy rain")');
    await expect(page.locator('#sub')).toHaveText('City expressway · Dusk · Heavy rain');
    await expect(page.locator('#segWeather button:has-text("Heavy rain")')).toHaveAttribute('aria-pressed', 'true');

    // Neither a jump nor stuck: the rain level passes through values in between.
    const level = () => page.evaluate(() => window.__drivey.environment.rainLevel);
    await advance(page, 0.3);
    expect(await level()).toBeGreaterThan(0.02);
    expect(await level()).toBeLessThan(0.9);
    await advance(page, 8);
    expect(await level()).toBeGreaterThan(0.95);

    await page.reload();
    await expect(page.locator('#sub')).toHaveText('City expressway · Dusk · Heavy rain');
  });

  test('new visitors start on a rainy night', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#sub')).toHaveText('City expressway · Night · Rain');
  });

  for (const [weather, kind] of [['rain', 'rain'], ['snow', 'snow']] as const) {
    test(`${weather} falls outside the car`, async ({ page }) => {
      await openApp(page, { weather });
      await expect.poll(() => page.evaluate(k => window.__drivey.particles[k].visible, kind)).toBe(true);
      const other = kind === 'rain' ? 'snow' : 'rain';
      expect(await page.evaluate(k => window.__drivey.particles[k].visible, other)).toBe(false);
    });
  }

  test('clear weather has nothing falling and nothing on the glass', async ({ page }) => {
    await openApp(page, { weather: 'clear' });
    await page.waitForTimeout(1000);
    expect(await page.evaluate(() => window.__drivey.particles.rain.visible || window.__drivey.particles.snow.visible)).toBe(false);
    expect(await glassPixels(page)).toBe(0);
  });
});

test.describe('windshield', () => {
  const wiper = (page: any) => page.evaluate(() => {
    const { windshield } = window.__drivey;
    return { angle: windshield.wiperAngle, length: windshield.wiperLength, period: windshield.wiperPeriod };
  });

  test('wipers sweep in rain and stay parked when clear', async ({ page }) => {
    await openApp(page, { weather: 'heavy' });
    await page.evaluate(() => window.__drivey.simulate(0.05));
    const start = (await wiper(page)).angle;
    await advance(page, 0.5);
    expect(Math.abs((await wiper(page)).angle - start)).toBeGreaterThan(0.2);
    await update(page, { weather: 'clear' });
    await advance(page, 10);
    await expect.poll(async () => (await wiper(page)).period).toBe(0);
    const parked = (await wiper(page)).angle;
    await page.waitForTimeout(500);
    expect((await wiper(page)).angle).toBe(parked);
  });

  test('wipers are long enough for the shape of the glass', async ({ page }) => {
    await openApp(page, { weather: 'rain' });
    const { length } = await wiper(page);
    const width = page.viewportSize()!.width;
    // On a phone they used to stop at 45% of the narrow width, barely covering the tall glass.
    if (isPortrait(page)) expect(length).toBeGreaterThan(width * 0.9);
    else expect(length).toBeGreaterThan(width * 0.3);
  });

  test('drops gather in rain, leave trails, and dry up when it stops', async ({ page }) => {
    await openApp(page, { weather: 'heavy' });
    await advance(page, 3);
    await expect.poll(() => glassPixels(page)).toBeGreaterThan(50);
    await expect.poll(() => page.evaluate(() => window.__drivey.windshield.drops.some((d: any) => !d.flake && d.startY - d.y > 2))).toBe(true);

    await update(page, { weather: 'clear' });
    await advance(page, 10);
    await expect.poll(async () => (await wiper(page)).period).toBe(0);

    // Placed beyond the blades' reach, so only drying can remove it, unlike anything they sweep.
    await page.evaluate(() => {
      const { windshield } = window.__drivey;
      const sprite = windshield.sprites.plain;
      windshield.drops.push({ x: windshield.width - 3, y: windshield.top + 8, r: 2, sprite, alpha: 1, flake: false, startY: windshield.top + 8 });
    });
    expect(await page.evaluate(() => window.__drivey.windshield.drops.length)).toBeGreaterThan(0);
    await advance(page, 8);
    expect(await page.evaluate(() => window.__drivey.windshield.drops.length)).toBe(0);
    // Once seen only on a slow CI machine; the state says what was still being drawn.
    const state = await page.evaluate(() => {
      const w = window.__drivey.windshield;
      return JSON.stringify({ drops: w.drops.length, veil: w.veil, angle: w.wiperAngle, period: w.wiperPeriod, phase: w.wiperPhase, motion: w.wiperMotion, wet: w.wetGlass });
    });
    expect(await glassPixels(page), state).toBe(0);
  });

  test('no water film stays behind if the weather clears just as a wipe ends', async ({ page }) => {
    await openApp(page, { weather: 'heavy' });
    // Stops on the exact frame a stroke finishes, which is where the film once got stuck on the glass.
    await page.evaluate(() => {
      const { windshield, simulate, settings } = window.__drivey;
      let wasMoving = false;
      for (let i = 0; i < 400; i++) {
        simulate(0.05);
        if (wasMoving && windshield.wiperPhase === 0) break;
        wasMoving = windshield.wiperPhase > 0;
      }
      settings.update({ weather: 'clear' });
    });
    await advance(page, 10);
    expect(await glassPixels(page)).toBe(0);
  });

  for (const driveSide of ['left', 'right'] as const) {
    test(`with the wheel on the ${driveSide === 'left' ? 'right' : 'left'}, rain and wipers stay inside the pillars`, async ({ page }) => {
      test.skip(isPortrait(page), 'the pillars are off screen in portrait');
      await openApp(page, { weather: 'heavy', driveSide });
      // Strips just beyond each A-pillar, at its middle, out to the edge of the screen.
      const outside = await page.evaluate(() => {
        const { cockpit, stage } = window.__drivey;
        stage.camera.updateMatrixWorld(true);
        return cockpit.glassOccluders.slice(2, 4).map((o: any) => {
          const [bottomInner, topInner, topOuter] = o.points.map((p: any) => {
            const v = o.object.localToWorld(p.clone()).project(stage.camera);
            return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (0.5 - v.y * 0.5) * innerHeight };
          });
          const mid = { x: (bottomInner.x + topInner.x) / 2, y: (bottomInner.y + topInner.y) / 2 };
          const out = Math.sign(topOuter.x - topInner.x);
          return out > 0
            ? { left: Math.min(innerWidth, mid.x + 10), right: innerWidth, top: mid.y - 25, bottom: mid.y + 25 }
            : { left: 0, right: Math.max(0, mid.x - 10), top: mid.y - 25, bottom: mid.y + 25 };
        });
      });
      expect(outside.some((r: any) => r.right - r.left > 20)).toBe(true);
      // Across a few wiper strokes, with drops landing everywhere.
      for (let i = 0; i < 6; i++) {
        await advance(page, 0.4);
        for (const rect of outside) expect(await glassPixels(page, rect)).toBe(0);
      }
      expect(await glassPixels(page)).toBeGreaterThan(50);
    });
  }

  test('nothing on the glass is drawn over the mirror or below the dashboard', async ({ page }) => {
    await openApp(page, { weather: 'heavy' });
    await advance(page, 3);
    await expect.poll(() => glassPixels(page)).toBeGreaterThan(50);
    const size = page.viewportSize()!;
    const dash = await page.evaluate(() => window.__drivey.windshield.bottom);
    for (let i = 0; i < 6; i++) {
      expect(await glassPixels(page, await mirrorInnerRect(page))).toBe(0);
      expect(await glassPixels(page, { left: 0, right: size.width, top: dash + 2, bottom: size.height })).toBe(0);
      await page.waitForTimeout(250);
    }
  });
});

test.describe('road surface', () => {
  test('wet roads get a real reflection, dry roads skip the work', async ({ page }) => {
    await openApp(page, { weather: 'rain' });
    const reflectionPixels = () => page.evaluate(() => {
      const { roadSurface, stage } = window.__drivey;
      const t = roadSurface.target, buf = new Uint16Array(t.width * t.height * 4);
      stage.renderer.readRenderTargetPixels(t, 0, 0, t.width, t.height, buf);
      let lit = 0;
      for (let i = 0; i < buf.length; i += 4) if (buf[i] || buf[i + 1] || buf[i + 2]) lit++;
      return lit / (t.width * t.height);
    });
    await expect.poll(reflectionPixels).toBeGreaterThan(0.05);
    expect(await page.evaluate(() => window.__drivey.roadSurface.wet.value)).toBeGreaterThan(0.5);

    await update(page, { weather: 'clear' });
    await advance(page, 10);
    await expect.poll(() => page.evaluate(() => window.__drivey.roadSurface.wet.value)).toBe(0);
    const passes = await page.evaluate(() => new Promise<number>(resolve => {
      const { roadSurface } = window.__drivey;
      let count = 0;
      const original = roadSurface.renderReflection;
      roadSurface.renderReflection = function () { count++; original.call(this); };
      setTimeout(() => { roadSurface.renderReflection = original; resolve(count); }, 800);
    }));
    expect(passes).toBe(0);
  });

  test('the reflection keeps enough resolution in every orientation', async ({ page }) => {
    await openApp(page, { weather: 'rain' });
    const size = await page.evaluate(() => {
      const t = window.__drivey.roadSurface.target;
      return { w: t.width, h: t.height, samples: t.samples };
    });
    // Portrait once got 166 pixels of width, which made the rail's reflection look blocky.
    expect(Math.min(size.w, size.h)).toBeGreaterThanOrEqual(300);
    expect(Math.max(size.w, size.h)).toBeLessThanOrEqual(720);
    expect(size.samples).toBeGreaterThan(0);
    const viewport = page.viewportSize()!;
    expect(Math.abs(size.w / size.h - viewport.width / viewport.height)).toBeLessThan(0.02);
  });

  test('snow covers the road by day, and stays out of white-out at night', async ({ page }) => {
    await openApp(page, { tod: 'day', weather: 'clear', bloom: true });
    const probe = await screenOf(page, 0, 0, -14);
    const dry = await brightnessAt(page, probe.x, probe.y, 5);

    await update(page, { weather: 'snow' });
    await advance(page, 10);
    await expect.poll(() => page.evaluate(() => window.__drivey.environment.snowLevel)).toBeGreaterThan(0.95);
    expect(await brightnessAt(page, probe.x, probe.y, 5)).toBeGreaterThan(dry + 25);

    await update(page, { tod: 'night' });
    await advance(page, 10);
    await expect.poll(() => page.evaluate(() => window.__drivey.environment.headlightLevel)).toBeGreaterThan(0.95);
    // Headlights tuned for dark asphalt used to blow snow out to pure white, so check along the beam.
    for (const z of [-5, -7, -9, -12]) {
      const p = await screenOf(page, -0.4, 0, z);
      expect(await brightnessAt(page, p.x, p.y, 6)).toBeLessThan(235);
    }
  });

  test('the cockpit light cannot reach the road, which caused hard-edged glare', async ({ page }) => {
    await openApp(page);
    const { distance, height } = await page.evaluate(() => {
      const { cockpit, stage } = window.__drivey;
      return { distance: cockpit.passLight.distance, height: stage.eyeHeight + cockpit.passLight.position.y };
    });
    expect(distance).toBeLessThan(height);
  });
});

test('buildings have contrast by day and stay dark at night', async ({ page }) => {
  await openApp(page, { tod: 'day', weather: 'clear' });
  const luminance = () => page.evaluate(() => {
    const c = window.__drivey.pool.chunks[1].buildings[0].material.color;
    return c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
  });
  expect(await luminance()).toBeGreaterThan(0.2);
  await update(page, { tod: 'night' });
  await advance(page, 10);
  await expect.poll(luminance).toBeLessThan(0.05);
});

test('glow textures are smooth, which fixed the speckle in Safari', async ({ page }) => {
  await openApp(page, { weather: 'clear' });
  // One frame varies a lot with what's in view, so count over several.
  const speckle = { dots: 0, invalid: 0 };
  for (let frame = 0; frame < 8; frame++) {
  const counts = await page.evaluate(() => {
    const { stage, postfx } = window.__drivey;
    const r = stage.renderer, rt = postfx.composer.renderTarget1, w = rt.width, h = rt.height;
    const f = (v: number) => {
      const s = v & 0x8000 ? -1 : 1, e = (v >> 10) & 31, m = v & 1023;
      return e === 31 ? NaN : e === 0 ? s * m * 2 ** -24 : s * (1 + m / 1024) * 2 ** (e - 15);
    };
    r.setRenderTarget(rt);
    r.render(stage.scene, stage.camera);
    const buf = new Uint16Array(w * h * 4);
    r.readRenderTargetPixels(rt, 0, 0, w, h, buf);
    r.setRenderTarget(null);
    const L = (i: number) => {
      const k = i * 4;
      return 255 * Math.min(1, Math.sqrt(Math.max(0, f(buf[k]) * 0.3 + f(buf[k + 1]) * 0.59 + f(buf[k + 2]) * 0.11)));
    };
    let dots = 0, invalid = 0;
    for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) {
        const i = y * w + x, l = L(i);
        if (Number.isNaN(l)) invalid++;
        const n = [L(i - 1), L(i + 1), L(i - w), L(i + w)];
        const lo = Math.min(...n), hi = Math.max(...n);
        if (lo > 30 && l < lo - 5 && hi - lo < 8) dots++;
      }
    }
    return { dots, invalid };
  });
  speckle.dots += counts.dots;
  speckle.invalid += counts.invalid;
  await page.waitForTimeout(300);
  }
  expect(speckle.invalid).toBe(0);
  // Before the fix this scored 200 or more in WebKit; since then, single digits.
  expect(speckle.dots).toBeLessThan(60);
});
