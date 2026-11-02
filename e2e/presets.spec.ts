import { expect, openApp, openParked, openSceneTab, test, update } from './support';

test.describe('scene presets', () => {
  test('one tap on the start screen sets the route, time, weather and music', async ({ page }) => {
    await openParked(page, { route: 'city', tod: 'night', weather: 'rain', style: 'chillhop' });
    await expect(page.locator('#startPreset button.on')).toHaveText('Rainy Tokyo night');

    await page.locator('#startPreset button:has-text("Foggy coast at dusk")').click();
    expect(await page.evaluate(() => {
      const { route, tod, weather, style } = window.__drivey.settings.value;
      return { route, tod, weather, style, playerStyle: window.__drivey.player.style };
    })).toEqual({ route: 'coast', tod: 'dusk', weather: 'fog', style: 'ambient', playerStyle: 'ambient' });
    await expect(page.locator('#startPreset button.on')).toHaveText('Foggy coast at dusk');
    await expect(page.locator('#startRoute button:has-text("Coastal road")')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#startWeather button:has-text("Fog")')).toHaveAttribute('aria-pressed', 'true');
    // The car is actually on the coast now, not just the setting.
    expect(await page.evaluate(() => window.__drivey.drive.route.name)).toBe('Coastal road');
  });

  test('the settings copy agrees, and changing one part clears the highlight', async ({ page }) => {
    await openApp(page, { route: 'highway', tod: 'night', weather: 'clear' });
    await openSceneTab(page);
    await expect(page.locator('#segPreset button.on')).toHaveText('Neon highway');
    await page.click('#segWeather button:has-text("Snow")');
    await expect(page.locator('#segPreset button.on')).toHaveCount(0);

    await page.click('#segPreset button:has-text("Snowy countryside")');
    await expect(page.locator('#segPreset button.on')).toHaveText('Snowy countryside');
    await expect(page.locator('#segRoute button:has-text("Countryside")')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#sub')).toHaveText('Countryside · Night · Snow');
  });

  test('a scene that matches no preset highlights none', async ({ page }) => {
    await openParked(page);
    await update(page, { route: 'coast', tod: 'day', weather: 'snow' });
    await expect(page.locator('#startPreset button.on')).toHaveCount(0);
  });
});
