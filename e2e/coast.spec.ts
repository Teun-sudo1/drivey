import { advance, expect, openApp, test, update } from './support';

test.describe('coastal road', () => {
  test('rocks and buildings never reach the road, however the scenery is rolled', async ({ page }) => {
    await openApp(page, { route: 'coast', driveSide: 'left' });
    const nearest = await page.evaluate(() => {
      const { pool, drive } = window.__drivey;
      let nearest = Infinity;
      // Every rebuild rolls new sizes, turns and leans.
      for (let lap = 0; lap < 12; lap++) {
        pool.setRoute(drive.route);
        for (const chunk of pool.chunks) {
          chunk.group.updateMatrixWorld(true);
          for (const variant of chunk.variants) {
            variant.traverse((o: any) => {
              // Palm crowns overhang the road well above the traffic, as they should.
              if (!o.isMesh || o.material.name.startsWith('palm')) return;
              if (o.isInstancedMesh) o.computeBoundingBox();
              else o.geometry.computeBoundingBox();
              const box = (o.isInstancedMesh ? o.boundingBox : o.geometry.boundingBox).clone().applyMatrix4(o.matrixWorld);
              // Only what stands above the road counts, not strips of ground.
              if (box.max.y > 0.3) nearest = Math.min(nearest, box.min.x);
            });
          }
        }
      }
      return nearest;
    });
    // The far edge line of the road is at 4.85.
    expect(nearest).toBeGreaterThan(5.6);
  });

  test('the land side changes in stretches of several chunks', async ({ page }) => {
    await openApp(page, { route: 'coast' });
    const shown: number[] = await page.evaluate(() => {
      const { pool, simulate } = window.__drivey;
      // Far enough to recycle the whole road more than twice.
      for (let t = 0; t < 70; t += 0.05) simulate(0.05);
      return [...pool.chunks].sort((a: any, b: any) => b.group.position.z - a.group.position.z).map((c: any) => c.variants.findIndex((v: any) => v.visible));
    });
    expect(shown.every(v => v >= 0)).toBe(true);
    expect(new Set(shown).size).toBeGreaterThan(1);
    const stretches: number[] = [];
    shown.forEach((v, i) => {
      if (i > 0 && shown[i - 1] === v) stretches[stretches.length - 1]++;
      else stretches.push(1);
    });
    // The two ends of the road can cut a stretch short; in between, none is a single chunk.
    for (const n of stretches.slice(1, -1)) expect(n).toBeGreaterThanOrEqual(3);
  });

  test('a beach runs from the seawall into the sea, with palms on it', async ({ page }) => {
    await openApp(page, { route: 'coast', driveSide: 'left' });
    const beach = await page.evaluate(() => {
      const chunk = window.__drivey.pool.chunks[2];
      chunk.group.updateMatrixWorld(true);
      const sand = { near: -Infinity, far: Infinity, lowest: Infinity };
      let palms = 0;
      for (const o of chunk.group.children as any[]) {
        if (o.isInstancedMesh && o.material.name === 'palmTrunk') palms += o.count;
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
