import type { Page } from '@playwright/test';
import { advance, brightnessAt, expect, openApp, openParked, openSceneTab, screenOf, test, update, waitForFrames } from './support';

const ROUTES = [
  { id: 'city', name: 'City expressway', cruise: 22, ahead: 6, oncoming: 5 },
  { id: 'coast', name: 'Coastal road', cruise: 19, ahead: 3, oncoming: 4 },
  { id: 'highway', name: 'Highway', cruise: 28, ahead: 6, oncoming: 6 },
  { id: 'country', name: 'Countryside', cruise: 16, ahead: 2, oncoming: 3 }
] as const;

/** Drives on until the car is well inside a tunnel with plenty of it still ahead. */
async function driveIntoTunnel(page: Page): Promise<void> {
  const inside = await page.evaluate(() => {
    const { simulate, pool } = window.__drivey;
    for (let i = 0; i < 40000; i++) {
      simulate(0.05);
      const s = pool.shelters()[0];
      if (s && s.near > 20 && s.far < -60) return true;
    }
    return false;
  });
  expect(inside).toBe(true);
}

test.describe('routes', () => {
  test('all four can be picked on the start screen and in settings, and are remembered', async ({ page }) => {
    await openParked(page, { route: 'city' });
    await page.click('#startRoute button:has-text("Coastal road")');
    await expect(page.locator('#sub')).toHaveText(/^Coastal road · /);
    expect(await page.evaluate(() => window.__drivey.backdrop.sea.visible)).toBe(true);

    await page.reload();
    await waitForFrames(page);
    await expect(page.locator('#startRoute button:has-text("Coastal road")')).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(() => window.__drivey.startScreen.skip());
    await openSceneTab(page);
    await expect(page.locator('#segRoute button')).toHaveText(ROUTES.map(r => r.name));
    await expect(page.locator('#segRoute button:has-text("Coastal road")')).toHaveAttribute('aria-pressed', 'true');
    await page.click('#segRoute button:has-text("Countryside")');
    await expect(page.locator('#sub')).toHaveText(/^Countryside · /);
  });

  for (const route of ROUTES) {
    test(`${route.name} cruises at its own speed with its own traffic`, async ({ page }) => {
      // Starts elsewhere and switches mid-drive, which is the harder case.
      await openApp(page, { route: route.id === 'city' ? 'country' : 'city' });
      await advance(page, 5);
      await update(page, { route: route.id });
      await advance(page, 30);
      const state = await page.evaluate(() => {
        const { drive, traffic, cockpit } = window.__drivey;
        return {
          speed: drive.speed,
          ahead: traffic.vehicles.filter((v: any) => !v.oncoming).length,
          oncoming: traffic.vehicles.filter((v: any) => v.oncoming).length,
          nav: cockpit.routeName
        };
      });
      expect(state.speed).toBeCloseTo(route.cruise, 0);
      expect(state).toMatchObject({ ahead: route.ahead, oncoming: route.oncoming, nav: route.name });
      await expect(page.locator('#sub')).toHaveText(new RegExp(`^${route.name} · `));
    });
  }

  test('every route stays within its draw-call budget, which phones depend on', async ({ page }) => {
    await openApp(page, { route: 'city', weather: 'clear' });
    for (const route of ROUTES) {
      await update(page, { route: route.id });
      await advance(page, 3);
      const calls = await page.evaluate(() => {
        const { stage } = window.__drivey, info = stage.renderer.info;
        info.autoReset = false;
        info.reset();
        stage.renderer.render(stage.scene, stage.camera);
        const n = info.render.calls;
        info.autoReset = true;
        return n;
      });
      // Before merging each chunk's static meshes the highway alone took over 500.
      expect(calls, route.name).toBeLessThan(420);
    }
  });

  test('switching route mid-drive keeps the engine running and frees the old road', async ({ page }) => {
    await openApp(page, { route: 'city' });
    await waitForFrames(page);
    // Scenery is only uploaded once it's first shown, so everything is shown for one frame
    // before counting; otherwise the count would depend on which kinds happened to be on screen.
    const memory = () => page.evaluate(() => {
      const { stage } = window.__drivey, hidden: any[] = [];
      stage.scene.traverse((o: any) => {
        if (!o.visible) hidden.push(o);
        o.visible = true;
      });
      stage.renderer.render(stage.scene, stage.camera);
      for (const o of hidden) o.visible = false;
      return { ...stage.renderer.info.memory };
    });
    // Each lap ends on the countryside, whose scenery has a fixed number of parts.
    const lap = async () => {
      for (const route of ROUTES) {
        await update(page, { route: route.id });
        await advance(page, 1);
        // Gives the renderer frames to upload the new road and release the old one.
        await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      }
    };
    // The first lap also uploads things each route uses for the first time, like its signs.
    await lap();
    const before = await memory();
    await lap();
    const after = await memory();
    // The city's towers are each a unique geometry, so a leak would add hundreds; cars and trucks differ a little.
    expect(after.geometries).toBeLessThan(before.geometries + 20);
    // Every sign is uploaded at startup, so nothing new should appear; a leaked skyline adds 8 a lap.
    expect(after.textures).toBeLessThanOrEqual(before.textures);
    expect(await page.evaluate(() => window.__drivey.engine.state)).toBe('running');
    await expect(page.locator('#start')).toHaveClass(/gone/);
  });

  test('the sea lies beside our lane, and swaps sides with the traffic', async ({ page }) => {
    await openApp(page, { route: 'coast', driveSide: 'left' });
    const seaX = () => page.evaluate(() => {
      const { backdrop } = window.__drivey;
      backdrop.sea.updateWorldMatrix(true, false);
      return backdrop.sea.getWorldPosition(backdrop.sea.position.clone()).x;
    });
    expect(await seaX()).toBeLessThan(-100);
    await update(page, { driveSide: 'right' });
    expect(await seaX()).toBeGreaterThan(100);
  });

  test('the routes away from the coast have no sea', async ({ page }) => {
    await openApp(page, { route: 'coast' });
    for (const route of ['city', 'highway', 'country']) {
      await update(page, { route });
      expect(await page.evaluate(() => window.__drivey.backdrop.sea.visible || window.__drivey.backdrop.shoreLights.visible)).toBe(false);
    }
  });

  test('snow settles on the countryside fields', async ({ page }) => {
    await openApp(page, { route: 'country', weather: 'clear', tod: 'day' });
    const ground = () => page.evaluate(() => window.__drivey.backdrop.ground.material.color.getHSL({ h: 0, s: 0, l: 0 }).l);
    const green = await ground();
    await update(page, { weather: 'snow' });
    await advance(page, 10);
    expect(await ground()).toBeGreaterThan(green + 0.3);
  });

  test('the mirror shows the streetlights of the road behind', async ({ page }) => {
    await openApp(page, { route: 'city' });
    const lamps = () => page.evaluate(() => window.__drivey.cockpit.mirror.lampSpacing);
    expect(await lamps()).toBe(20);
    await update(page, { route: 'country' });
    expect(await lamps()).toBe(Infinity);
  });
});

test.describe('highway tunnels', () => {
  test('only the highway has them', async ({ page }) => {
    await openApp(page, { route: 'city' });
    for (const route of ['city', 'coast', 'country']) {
      await update(page, { route });
      const covered = await page.evaluate(() => {
        const { simulate, pool } = window.__drivey;
        for (let i = 0; i < 1600; i++) {
          simulate(0.05);
          if (pool.shelters().length) return true;
        }
        return false;
      });
      expect(covered).toBe(false);
    }
  });

  test('a tunnel starts with a portal and keeps lamp posts and bridges out of its bore', async ({ page }) => {
    await openApp(page, { route: 'highway' });
    await driveIntoTunnel(page);
    const chunks = await page.evaluate(() => {
      const { pool } = window.__drivey;
      // Another tunnel may already be in sight further on, so this looks only at the one we are in.
      const here = pool.shelters()[0];
      return pool.chunks
        .filter((c: any) => c.tunnel.bore.visible && c.group.position.z <= here.near + 0.5 && c.group.position.z - 40 >= here.far - 0.5)
        .sort((a: any, b: any) => b.group.position.z - a.group.position.z)
        .map((c: any) => ({
          portal: c.tunnel.portal.visible,
          openAir: c.openAir.some((o: any) => o.visible),
          extras: c.extras.some((e: any) => e.object.visible)
        }));
    });
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks.every((c: any) => !c.openAir && !c.extras)).toBe(true);
    // Only the entrance has a portal, and tunnels start out of sight, so it may already be behind us.
    expect(chunks.filter((c: any) => c.portal).length).toBeLessThanOrEqual(1);
    expect(chunks.slice(1).some((c: any) => c.portal)).toBe(false);
  });

  test('inside, nothing new falls or lands on the glass, and the tunnel lights pass overhead', async ({ page }) => {
    await openApp(page, { route: 'highway', weather: 'heavy', tod: 'night' });
    const newDrops = () => page.evaluate(() => {
      const { windshield, simulate } = window.__drivey;
      const before = new Set(windshield.drops);
      simulate(0.5);
      return windshield.drops.filter((d: unknown) => !before.has(d)).length;
    });
    // In the open, for comparison.
    await advance(page, 2);
    expect(await newDrops()).toBeGreaterThan(0);

    await driveIntoTunnel(page);
    expect(await newDrops()).toBe(0);
    const inside = await page.evaluate(() => {
      const { particles, cockpit, simulate } = window.__drivey;
      let light = 0;
      const colors = new Set<string>();
      // A whole chunk's length, so it passes where the hidden street lamps stand.
      for (let i = 0; i < 40; i++) {
        simulate(0.05);
        light = Math.max(light, cockpit.passLight.intensity);
        if (cockpit.passLight.intensity > 0.1) colors.add(cockpit.passLight.color.getHexString());
      }
      return { rain: particles.rain.visible, light, colors: [...colors] };
    });
    // Lit only by the tunnel's own lights, never by the street lamps hidden in its bore.
    expect(inside).toEqual({ rain: false, light: expect.any(Number), colors: ['ffc56e'] });
    expect(inside.light).toBeGreaterThan(0.5);
  });

  test('the road in a tunnel stays clear of snow', async ({ page }) => {
    await openApp(page, { route: 'highway', weather: 'snow', tod: 'day' });
    await advance(page, 5);
    const road = async () => {
      const p = await screenOf(page, -0.4, 0, -9);
      return brightnessAt(page, p.x, p.y, 6);
    };
    const open = await road();
    await driveIntoTunnel(page);
    const sheltered = await road();
    expect(sheltered).toBeLessThan(open * 0.6);
  });
});
