import { expect, glassPixels, isPhone, isPortrait, mirrorRect, openParked, openSeat, test } from './support';

test.describe('seat', () => {
  test('each visit starts in the seat behind steamed-up glass, then sets up the drive', async ({ page }) => {
    await openSeat(page, { weather: 'clear' });
    await expect(page.locator('#startSeat')).toBeVisible();
    await expect(page.locator('#startSetup')).toBeHidden();
    // The glass hides the view while the seat is picked, and the roof light shows the cabin.
    expect(await glassPixels(page)).toBeGreaterThan(1000);
    const cabinLight = () => page.evaluate(() => window.__drivey.cockpit.cabinLight.intensity);
    await expect.poll(cabinLight).toBeGreaterThan(3);
    // The nav unit boots up meanwhile, showing it's planning the route.
    const navLevel = () => page.evaluate(() => window.__drivey.cockpit.screens[2].material.color.r);
    await expect.poll(navLevel).toBeGreaterThan(0.5);

    // The slider moves the eye back and forth, sideways or upright.
    const seatBack = () => page.evaluate(() => window.__drivey.stage.framing.seatBack);
    await page.locator('#startPov').fill('1');
    await expect.poll(seatBack).toBeGreaterThan(0.25);
    await page.locator('#startPov').fill('0.5');
    await expect.poll(seatBack).toBeGreaterThan(0.1);
    await page.locator('#startPov').fill('0');
    await expect.poll(seatBack).toBeLessThan(0.01);

    await page.click('#btnSeated');
    await expect(page.locator('#startSetup')).toBeVisible();
    await expect.poll(() => glassPixels(page), { timeout: 10_000 }).toBe(0);
    await expect.poll(cabinLight).toBeLessThan(0.05);
    // With the engine still off, the nav screen goes dark again once its loading screen ends.
    await expect.poll(navLevel).toBeLessThan(0.02);

    // The next visit settles in again, with the seat where it was left.
    await page.reload();
    await expect(page.locator('#startSeat')).toBeVisible();
    await expect(page.locator('#startPov')).toHaveValue('0');
    expect(await page.evaluate(() => window.__drivey.settings.value.pov)).toBe(0);
  });

  test('until chosen, phones sit close and bigger screens sit back, held either way', async ({ page }) => {
    await openSeat(page);
    expect(await page.evaluate(() => window.__drivey.stage.povFor())).toBe(isPhone(page) ? 0 : 1);
  });

  test('the seat can be changed in Scene settings', async ({ page }) => {
    await openParked(page, { pov: 0 });
    const seatBack = () => page.evaluate(() => window.__drivey.stage.framing.seatBack);
    expect(await seatBack()).toBeLessThan(0.01);
    await page.evaluate(() => window.__drivey.startScreen.skip());
    await page.click('#btnPanel');
    await page.click('[data-tab="scene"]');
    await page.locator('#segPov').fill('1');
    await expect.poll(seatBack).toBeGreaterThan(0.25);
    await expect.poll(() => page.evaluate(() => window.__drivey.stage.settled)).toBe(true);
    // Upright, the mirror still hangs just below the top bar however far back the eye sits.
    if (isPortrait(page)) {
      const mirror = await mirrorRect(page);
      expect(mirror.top).toBeGreaterThan(0);
    }
  });
});
