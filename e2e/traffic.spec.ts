import { advance, expect, openApp, openParked, test, update } from './support';

/** Simulates a long drive, checking every step that nobody drives into us or each other. */
async function crashes(page: import('@playwright/test').Page, seconds: number): Promise<string[]> {
  return page.evaluate(s => {
    const { simulate, traffic } = window.__drivey;
    const own = traffic.route.traffic.ahead[0];
    const found: string[] = [];
    for (let t = 0; t < s; t += 0.05) {
      simulate(0.05);
      const vs = traffic.vehicles;
      for (const v of vs) {
        // Our car spans about z = -2.2 to 2.2.
        if (Math.abs(traffic.laneX(v) - own) < 1.6 && Math.abs(v.z) < 2.2 + v.length / 2) found.push(`hit us at ${t.toFixed(1)} s`);
        for (const o of vs) {
          if (o === v || o.oncoming !== v.oncoming || Math.abs(traffic.laneX(o) - traffic.laneX(v)) > 1.6) continue;
          if (Math.abs(o.z - v.z) < (o.length + v.length) / 2) found.push(`two cars met at ${t.toFixed(1)} s`);
        }
      }
    }
    return [...new Set(found)];
  }, seconds);
}

test.describe('traffic', () => {
  test('keeps to its side of the road, and swaps with the driving side', async ({ page }) => {
    await openApp(page, { route: 'coast', driveSide: 'left' });
    const sides = () => page.evaluate(() => {
      const { traffic } = window.__drivey;
      return traffic.vehicles.map((v: any) => {
        v.group.updateWorldMatrix(true, false);
        const x = v.group.getWorldPosition(v.group.position.clone()).x;
        return { oncoming: v.oncoming, side: Math.sign(x), facing: Math.round(Math.cos(v.group.rotation.y)) };
      });
    });
    for (const v of await sides()) expect(v).toEqual(v.oncoming ? { oncoming: true, side: 1, facing: -1 } : { oncoming: false, side: -1, facing: 1 });
    await update(page, { driveSide: 'right' });
    for (const v of await sides()) expect(v.side).toBe(v.oncoming ? -1 : 1);
  });

  test('oncoming cars rush past while cars ahead pull away from a parked car', async ({ page }) => {
    await openParked(page, { route: 'coast' });
    const positions = () => page.evaluate(() => window.__drivey.traffic.vehicles.map((v: any) => ({ oncoming: v.oncoming, z: v.z })));
    const start = await positions();
    await advance(page, 2);
    const later = await positions();
    expect(await page.evaluate(() => window.__drivey.drive.speed)).toBe(0);
    later.forEach((v: any, i: number) => {
      if (v.oncoming) expect(v.z - start[i].z).toBeGreaterThan(25);
      else expect(v.z).toBeLessThan(start[i].z);
    });
  });

  for (const route of ['city', 'highway', 'coast']) {
    test(`on the ${route} route nobody drives into us or each other`, async ({ page }) => {
      await openApp(page, { route });
      expect(await crashes(page, 240)).toEqual([]);
      // Slowing for a break mustn't make the cars behind run into us.
      await page.evaluate(() => window.__drivey.timer.skip());
      expect(await crashes(page, 120)).toEqual([]);
    });
  }

  test('cars change lanes smoothly on the highway, never cutting in just ahead of us', async ({ page }) => {
    await openApp(page, { route: 'highway' });
    const report = await page.evaluate(() => {
      const { simulate, traffic } = window.__drivey;
      const own = traffic.route.traffic.ahead[0];
      let midway = 0, jumps = 0, cutIns = 0;
      const last = new Map<unknown, { x: number; z: number }>();
      for (let i = 0; i < 6000; i++) {
        simulate(0.05);
        for (const v of traffic.vehicles) {
          if (v.oncoming) continue;
          const x = traffic.laneX(v), prev = last.get(v);
          if (v.shift > 0.2 && v.shift < 0.8) midway++;
          if (v.shift === 0 && v.lane === own && v.z > -38) cutIns++;
          // A respawn moves a car far along the road; a jump sideways without one would be a teleport.
          if (prev && Math.abs(prev.z - v.z) < 20 && Math.abs(prev.x - x) > 0.2) jumps++;
          last.set(v, { x, z: v.z });
        }
      }
      return { midway, jumps, cutIns };
    });
    expect(report.midway).toBeGreaterThan(20);
    expect(report).toMatchObject({ jumps: 0, cutIns: 0 });
  });

  test('stays in lane on two-lane roads, where the other lane is oncoming', async ({ page }) => {
    await openApp(page, { route: 'country' });
    const wandered = await page.evaluate(() => {
      const { simulate, traffic } = window.__drivey;
      let n = 0;
      for (let i = 0; i < 2400; i++) {
        simulate(0.05);
        for (const v of traffic.vehicles) if (traffic.laneX(v) !== (v.oncoming ? 3.2 : -0.4)) n++;
      }
      return n;
    });
    expect(wandered).toBe(0);
  });

  test('car lights glow brighter at night than by day', async ({ page }) => {
    await openApp(page, { tod: 'day' });
    const glow = () => page.evaluate(() => {
      const sprite = window.__drivey.traffic.vehicles[0].group.children.find((c: any) => c.isSprite);
      return sprite.material.opacity;
    });
    await advance(page, 1);
    const day = await glow();
    await update(page, { tod: 'night' });
    await advance(page, 10);
    expect(await glow()).toBeGreaterThan(day + 0.4);
  });
});
