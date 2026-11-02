import type { Page } from '@playwright/test';
import { advance, expect, openApp, test } from './support';

/** Moves the timer as if `fraction` of the running focus block had gone by. */
async function focusAt(page: Page, fraction: number): Promise<void> {
  await page.evaluate(f => {
    const { timer } = window.__drivey;
    if (!timer.running) timer.start();
    timer.endAt = Date.now() + 25 * 60_000 * (1 - f);
    timer.tick();
  }, fraction);
}

test.describe('the scene follows the session', () => {
  test('evening draws in as you focus, and stays once the block ends', async ({ page }) => {
    await openApp(page, { tod: 'day', weather: 'clear' });
    const windows = () => page.evaluate(() => window.__drivey.environment.state.win);
    await focusAt(page, 0.02);
    await advance(page, 8);
    const start = await windows();
    await focusAt(page, 0.9);
    await advance(page, 8);
    // Most of the way to dusk, when windows light up.
    expect(await windows()).toBeGreaterThan(start + 0.5);
    await focusAt(page, 1.0001);
    await expect.poll(() => page.evaluate(() => window.__drivey.settings.value.tod)).toBe('dusk');
  });

  test('switched off, the light stays as chosen', async ({ page }) => {
    await openApp(page, { tod: 'day', weather: 'clear', followSession: false });
    const windows = () => page.evaluate(() => window.__drivey.environment.state.win);
    await advance(page, 4);
    const start = await windows();
    await focusAt(page, 0.9);
    await advance(page, 8);
    expect(await windows()).toBeCloseTo(start, 2);
    await focusAt(page, 1.0001);
    expect(await page.evaluate(() => window.__drivey.settings.value.tod)).toBe('day');
  });

  for (const route of ['highway', 'coast']) {
    test(`on the ${route}, a long break is spent at a rest stop, and the car drives on after`, async ({ page }) => {
      await openApp(page, { route, weather: 'clear' });
      await advance(page, 10);
      const report = await page.evaluate(() => {
        const { timer, simulate, drive, pool, traffic } = window.__drivey;
        // In the second lane where there is one, so pulling in means moving back over first.
        if (traffic.route.traffic.ahead.length > 1) Object.assign(traffic.own, { lane: 3.2, fromLane: 3.2, shift: 1, timer: 999 });
        // Starts a long break, as after the fourth session.
        timer.enterPhase('long');
        timer.notify();
        let hits = 0;
        for (let t = 0; t < 100; t += 0.05) {
          simulate(0.05);
          const own = traffic.route.traffic.ahead[0] + traffic.ownOffset - drive.pull;
          for (const v of traffic.vehicles) if (Math.abs(traffic.laneX(v) - own) < 1.6 && Math.abs(v.z) < 2.2 + v.length / 2) hits++;
        }
        const host = pool.chunks.find((c: any) => c.group.children.includes(pool.restStop.group));
        return { speed: drive.speed, bay: pool.restStopDistance(), pull: drive.pull, lane: traffic.ownOffset, hits, roadsideHidden: host.roadside.every((o: any) => !o.visible) };
      });
      expect(report.speed).toBe(0);
      expect(Math.abs(report.bay!)).toBeLessThan(1);
      // Wholly off the road: the car's right side, 0.9 m from its middle, past the edge line at -2.05.
      expect(-0.4 - report.pull + 0.9).toBeLessThan(-2.05);
      expect(report.roadsideHidden).toBe(true);
      expect(report).toMatchObject({ lane: 0, hits: 0 });

      // Back to focus: it pulls out and drives on.
      await page.evaluate(() => window.__drivey.timer.skip());
      await advance(page, 25);
      const after = await page.evaluate(() => ({ speed: window.__drivey.drive.speed, pull: window.__drivey.drive.pull }));
      expect(after.speed).toBeGreaterThan(10);
      expect(after.pull).toBeLessThan(0.2);
    });
  }

  test('switched off, a long break just slows the car', async ({ page }) => {
    await openApp(page, { route: 'coast', weather: 'clear', followSession: false });
    await advance(page, 10);
    const report = await page.evaluate(() => {
      const { timer, simulate, drive, pool } = window.__drivey;
      timer.enterPhase('long');
      timer.notify();
      for (let t = 0; t < 100; t += 0.05) simulate(0.05);
      return { speed: drive.speed, bay: pool.restStopDistance() };
    });
    expect(report.speed).toBeGreaterThan(5);
    expect(report.bay).toBeNull();
  });
});
