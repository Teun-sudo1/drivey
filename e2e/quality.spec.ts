import { advance, expect, isPhone, openApp, openSceneTab, test, update } from './support';

test.describe('quality', () => {
  // A sharp screen, so the pixel-ratio cap of each level shows.
  test.use({ deviceScaleFactor: 3 });

  test('auto picks medium on phones and high on computers', async ({ page }) => {
    await openApp(page);
    expect(await page.evaluate(() => window.__drivey.quality().name)).toBe(isPhone(page) ? 'Medium' : 'High');
  });

  test('each level scales sharpness, reflections, rain and bloom together', async ({ page }) => {
    await openApp(page, { weather: 'heavy', tod: 'night', bloom: true });
    const measure = () => page.evaluate(() => {
      const { stage, roadSurface, particles, postfx } = window.__drivey;
      let bloomed = 0, reflected = 0;
      const compose = postfx.composer.render, reflect = roadSurface.renderReflection;
      postfx.composer.render = (...a: unknown[]) => (bloomed++, compose.apply(postfx.composer, a));
      roadSurface.renderReflection = () => (reflected++, reflect.call(roadSurface));
      return new Promise<object>(resolve => {
        // A few real frames, so the loop decides what to draw.
        let frames = 6;
        const tick = () => {
          if (--frames > 0) return requestAnimationFrame(tick);
          postfx.composer.render = compose;
          roadSurface.renderReflection = reflect;
          resolve({ pixelRatio: stage.renderer.getPixelRatio(), reflectionHeight: roadSurface.target.height, particles: particles.budget, bloomed: bloomed > 0, reflected: reflected > 0 });
        };
        requestAnimationFrame(tick);
      });
    });
    await advance(page, 10);

    await update(page, { quality: 'high' });
    const high: any = await measure();
    expect(high).toMatchObject({ pixelRatio: 2, particles: 2000, bloomed: true, reflected: true });

    await update(page, { quality: 'medium' });
    const medium: any = await measure();
    expect(medium).toMatchObject({ pixelRatio: 1.5, particles: 1100, bloomed: true, reflected: true });
    expect(medium.reflectionHeight).toBeLessThan(high.reflectionHeight * 0.7);

    await update(page, { quality: 'low' });
    expect(await measure()).toMatchObject({ pixelRatio: 1, particles: 500, bloomed: false, reflected: false });
  });

  test('the setting is in Scene › Graphics and is remembered', async ({ page }) => {
    await openApp(page);
    await openSceneTab(page);
    await page.click('#segQuality button:has-text("Low")');
    await expect(page.locator('#segQuality button:has-text("Low")')).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await page.evaluate(() => window.__drivey.startScreen.skip());
    expect(await page.evaluate(() => window.__drivey.quality().name)).toBe('Low');
    await advance(page, 1);
  });
});
