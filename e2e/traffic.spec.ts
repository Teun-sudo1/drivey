import { advance, expect, openApp, openParked, test, update } from './support';

/** Simulates a long drive, checking every step that nobody drives into us or each other. */
async function crashes(page: import('@playwright/test').Page, seconds: number): Promise<string[]> {
  return page.evaluate(s => {
    const { simulate, traffic } = window.__drivey;
    const found: string[] = [];
    for (let t = 0; t < s; t += 0.05) {
      simulate(0.05);
      // Where our car is, including part way through moving over.
      const own = traffic.route.traffic.ahead[0] + traffic.ownOffset;
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
      let midway = 0, jumps = 0, cutIns = 0;
      const last = new Map<unknown, { x: number; z: number }>();
      for (let i = 0; i < 6000; i++) {
        simulate(0.05);
        for (const v of traffic.vehicles) {
          if (v.oncoming) continue;
          const x = traffic.laneX(v), prev = last.get(v);
          if (v.shift > 0.2 && v.shift < 0.8) midway++;
          const ours = [traffic.own.lane, traffic.own.fromLane];
          if (v.shift === 0 && ours.includes(v.lane) && v.z > -38) cutIns++;
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

  test('everyone keeps to the kerb lane, moving out only to overtake', async ({ page }) => {
    await openApp(page, { route: 'highway' });
    const report = await page.evaluate(() => {
      const { simulate, traffic } = window.__drivey;
      const kerb = (v: any) => (v.oncoming ? 13 : -0.4);
      let inKerb = 0, settled = 0, overtakes = 0;
      for (let i = 0; i < 4000; i++) {
        simulate(0.05);
        for (const v of traffic.vehicles) {
          if (v.shift === 0 && v.lane !== kerb(v)) overtakes++;
          if (v.shift < 1) continue;
          settled++;
          if (v.lane === kerb(v)) inKerb++;
        }
      }
      return { kerbShare: inKerb / settled, overtakes };
    });
    expect(report.kerbShare).toBeGreaterThan(0.7);
    expect(report.overtakes).toBeGreaterThan(0);
  });

  test('oncoming cars change lanes too on roads with two lanes each way', async ({ page }) => {
    await openApp(page, { route: 'highway' });
    const midway = await page.evaluate(() => {
      const { simulate, traffic } = window.__drivey;
      let n = 0;
      for (let i = 0; i < 4000; i++) {
        simulate(0.05);
        for (const v of traffic.vehicles) if (v.oncoming && v.shift > 0.2 && v.shift < 0.8) n++;
      }
      return n;
    });
    expect(midway).toBeGreaterThan(10);
  });

  test('the city has oncoming traffic beyond a median', async ({ page }) => {
    await openApp(page, { route: 'city' });
    const lanes = await page.evaluate(() => window.__drivey.traffic.vehicles.filter((v: any) => v.oncoming).map((v: any) => v.lane));
    expect(lanes.length).toBeGreaterThan(0);
    for (const x of lanes) expect(x).toBeGreaterThan(6.3);
  });

  for (const route of ['city', 'highway']) {
    test(`on the ${route} route our car overtakes slower cars, smoothly, with the headlights, then moves back in`, async ({ page }) => {
      await openApp(page, { route, driveSide: 'left' });
      await advance(page, 15);
      const track = await page.evaluate(() => {
        const { simulate, traffic, stage } = window.__drivey;
        // A slow car ahead in our lane, but another right alongside: overtaking must wait.
        const cars = traffic.vehicles.filter((v: any) => !v.oncoming);
        for (const v of cars) Object.assign(v, { z: -300, lane: -0.4, fromLane: -0.4, shift: 1, changeTimer: 99 });
        Object.assign(cars[0], { lane: 3.2, fromLane: 3.2, z: 0, cruise: traffic.route.speed, speed: traffic.route.speed });
        Object.assign(cars[1], { z: -35, cruise: traffic.route.speed * 0.5, speed: traffic.route.speed * 0.5 });
        traffic.own.timer = 0;
        for (let i = 0; i < 20; i++) simulate(0.05);
        const waited = traffic.ownOffset;
        // Clears the way alongside, so out we go.
        cars[0].z = -300;
        traffic.own.timer = 0;
        const xs: number[] = [];
        // Signals first, then moves over, the indicator flashing in the door mirror on that side.
        const { cockpit } = window.__drivey;
        const blinks = [0, 0];
        let flashesBeforeMoving = 0;
        for (let i = 0; i < 160; i++) {
          simulate(0.05);
          cockpit.update(0, 0, 0, i * 0.05);
          xs.push(stage.camera.position.x);
          cockpit.blinkers.forEach((b: any, k: number) => (blinks[k] += b.visible ? 1 : 0));
          if (traffic.ownOffset === 0 && cockpit.blinkers[1].visible) flashesBeforeMoving++;
        }
        // Midway between the two headlamps.
        const lamps = stage.scene.children.filter((c: any) => c.isSpotLight);
        const lights = (lamps[0].position.x + lamps[1].position.x) / 2;
        const offset = traffic.ownOffset;
        // Past it, with no one else slower ahead, back into the kerb lane.
        cars[1].z = -300;
        cars[1].cruise = traffic.route.speed;
        for (let i = 0; i < 200; i++) simulate(0.05);
        return { waited, xs, lights, offset, back: traffic.ownOffset, blinks, flashesBeforeMoving, lamps: lamps.map((l: any) => l.position.x) };
      });
      expect(track.back).toBeCloseTo(0, 1);
      expect(track.blinks[0]).toBe(0);
      expect(track.blinks[1]).toBeGreaterThan(20);
      expect(track.flashesBeforeMoving).toBeGreaterThan(3);
      // Two headlamps, a car's width apart.
      expect(Math.abs(track.lamps[0] - track.lamps[1])).toBeGreaterThan(1);
      expect(track.waited).toBe(0);
      expect(track.offset).toBeCloseTo(3.6, 1);
      expect(track.xs.at(-1)).toBeCloseTo(3.6, 1);
      expect(track.lights).toBeCloseTo(3.2, 1);
      // Gradually, never in a jump.
      for (let i = 1; i < track.xs.length; i++) expect(Math.abs(track.xs[i] - track.xs[i - 1])).toBeLessThan(0.15);
    });
  }

  test('stays in lane on two-lane roads, where the other lane is oncoming', async ({ page }) => {
    await openApp(page, { route: 'country' });
    const wandered = await page.evaluate(() => {
      const { simulate, traffic } = window.__drivey;
      let n = 0;
      for (let i = 0; i < 2400; i++) {
        simulate(0.05);
        for (const v of traffic.vehicles) if (traffic.laneX(v) !== (v.oncoming ? 3.2 : -0.4)) n++;
        if (traffic.ownOffset !== 0) n++;
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
