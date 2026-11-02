import { advance, expect, openApp, test, update } from './support';

/** Each route's road from its outer edge on our side to the far one, which no scenery may stand on. */
const ROADS = { city: [-2.3, 15.1], coast: [-2.3, 5.1], highway: [-2.3, 15.1], country: [-2, 4.8] } as const;

test.describe('scenery', () => {
  for (const [route, [left, right]] of Object.entries(ROADS)) {
    test(`nothing on the ${route} route stands on the road, however the scenery is rolled`, async ({ page }) => {
      await openApp(page, { route, driveSide: 'left' });
      const intruders = await page.evaluate(([left, right]) => {
        const { pool, drive } = window.__drivey;
        const found = new Set<string>();
        // Any Vector3 will do as scratch space.
        const v = pool.chunks[0].group.position.clone();
        for (let lap = 0; lap < 4; lap++) {
          // Every rebuild rolls new sizes, turns, leans and positions.
          pool.setRoute(drive.route);
          for (const chunk of pool.chunks) {
            chunk.group.updateMatrixWorld(true);
            for (const variant of chunk.variants) {
              variant.traverse((o: any) => {
                // Palm crowns overhang the road well above the traffic, as they should.
                if (!o.isMesh || o.material.name.startsWith('palm')) return;
                // Vertex by vertex, as meshes on both sides of the road are merged into one.
                const pos = o.geometry.attributes.position, count = o.isInstancedMesh ? o.count : 1;
                const m = o.matrixWorld.clone(), local = m.clone();
                for (let i = 0; i < count; i++) {
                  const world = o.isInstancedMesh ? (o.getMatrixAt(i, local), m.clone().multiply(local)) : m;
                  for (let k = 0; k < pos.count; k++) {
                    v.fromBufferAttribute(pos, k).applyMatrix4(world);
                    // Only what stands above the road counts, not strips of ground.
                    if (v.y > 0.3 && v.x > left - 0.2 && v.x < right + 0.2) found.add(`${o.material.name || o.material.type} at x ${v.x.toFixed(1)}, y ${v.y.toFixed(1)}`);
                  }
                }
              });
            }
          }
        }
        return [...found].slice(0, 5);
      }, [left, right]);
      expect(intruders).toEqual([]);
    });

    test(`the ${route} route changes scenery in stretches of several chunks`, async ({ page }) => {
      await openApp(page, { route });
      const shown: number[] = await page.evaluate(() => {
        const { pool, simulate } = window.__drivey;
        // Far enough to recycle the whole road more than twice; tunnels hide every kind for a while.
        for (let t = 0; t < 70; t += 0.05) simulate(0.05);
        return [...pool.chunks].sort((a: any, b: any) => b.group.position.z - a.group.position.z).map((c: any) => c.variants.findIndex((v: any) => v.visible));
      });
      const open = shown.filter(v => v >= 0);
      expect(open.length).toBeGreaterThan(5);
      expect(new Set(open).size).toBeGreaterThan(1);
      const stretches: number[] = [];
      shown.forEach((v, i) => {
        if (i > 0 && shown[i - 1] === v) stretches[stretches.length - 1]++;
        else stretches.push(1);
      });
      // The two ends of the road, and tunnels, can cut a stretch short; in between, none is a single chunk.
      if (!shown.includes(-1)) for (const n of stretches.slice(1, -1)) expect(n).toBeGreaterThanOrEqual(3);
    });
  }

  // How many different widths each route's sceneries give its road.
  for (const [route, kinds] of [['highway', 3], ['country', 2]] as const) {
    test(`the ${route} road widens and narrows with its scenery`, async ({ page }) => {
      await openApp(page, { route, driveSide: 'left' });
      const widths = await page.evaluate(() => {
        const chunk = window.__drivey.pool.chunks[0];
        chunk.group.updateMatrixWorld(true);
        return chunk.variants.map((variant: any) => {
          let edge = 0;
          variant.traverse((o: any) => {
            if (!o.isMesh || o.material.name !== 'road') return;
            o.geometry.computeBoundingBox();
            edge = Math.min(edge, o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld).min.x);
          });
          return Math.round(edge * 10) / 10;
        });
      });
      expect(new Set(widths).size).toBe(kinds);
    });
  }
});

test.describe('coastal road', () => {
  test('a beach runs from the seawall into the sea, with palms on it', async ({ page }) => {
    await openApp(page, { route: 'coast', driveSide: 'left' });
    const beach = await page.evaluate(() => {
      const chunk = window.__drivey.pool.chunks[2];
      chunk.group.updateMatrixWorld(true);
      const sand = { near: -Infinity, far: Infinity, lowest: Infinity };
      let palms = 0;
      for (const side of chunk.roadside) {
        for (const o of side.children as any[]) if (o.isInstancedMesh && o.material.name === 'palmTrunk') palms += o.count;
      }
      chunk.group.traverse((o: any) => {
        // The beach is the sand on the sea side, built straight into the chunk rather than one of the land sceneries.
        if (!o.isMesh || o.material.name !== 'sand' || chunk.variants.some((v: any) => v === o.parent || v === o)) return;
        o.geometry.computeBoundingBox();
        const box = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
        sand.near = Math.max(sand.near, box.max.x);
        sand.far = Math.min(sand.far, box.min.x);
        sand.lowest = Math.min(sand.lowest, box.min.y);
      });
      return { sand, palms };
    });
    // From the seawall beside the road's edge at -2.3, out past where it slips under the sea at -3.
    expect(beach.sand.near).toBeLessThan(-2.3);
    expect(beach.sand.near).toBeGreaterThan(-3.5);
    expect(beach.sand.far).toBeLessThan(-30);
    expect(beach.sand.lowest).toBeLessThan(-3);
    expect(beach.palms).toBeGreaterThan(0);
  });

  test('neon glows at night and pales by day', async ({ page }) => {
    await openApp(page, { route: 'coast', tod: 'night', weather: 'clear' });
    const neon = () => page.evaluate(() => {
      let level = 0;
      window.__drivey.pool.chunks[0].group.traverse((o: any) => {
        if (o.isMesh && o.material.name === 'neon') level = o.material.color.r;
      });
      return level;
    });
    await advance(page, 10);
    const night = await neon();
    await update(page, { tod: 'day' });
    await advance(page, 10);
    expect(night).toBeGreaterThan((await neon()) * 2.5);
  });
});
