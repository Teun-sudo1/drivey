import { expect, glassPixels, isPortrait, openParked, test } from './support';

test.describe('seat', () => {
  test('the first visit picks a seat behind steamed-up glass, then sets up the drive', async ({ page }) => {
    await openParked(page, { seatPicked: false, weather: 'clear' });
    await expect(page.locator('#startSeat')).toBeVisible();
    await expect(page.locator('#startSetup')).toBeHidden();
    // The glass hides the view while the seat is picked, and the roof light shows the cabin.
    expect(await glassPixels(page)).toBeGreaterThan(1000);
    const cabinLight = () => page.evaluate(() => window.__drivey.cockpit.cabinLight.intensity);
    await expect.poll(cabinLight).toBeGreaterThan(3);

    const seatBack = () => page.evaluate(() => window.__drivey.stage.framing.seatBack);
    await page.click('#startSeatChoice button:has-text("Sit back")');
    // Upright, the view is already narrow, so the seat only shows with the screen sideways.
    if (!isPortrait(page)) await expect.poll(seatBack).toBeGreaterThan(0.35);
    await page.click('#startSeatChoice button:has-text("Close to the wheel")');
    if (!isPortrait(page)) await expect.poll(seatBack).toBeLessThan(0.01);

    await page.click('#btnSeated');
    await expect(page.locator('#startSetup')).toBeVisible();
    await expect.poll(() => glassPixels(page), { timeout: 10_000 }).toBe(0);
    await expect.poll(cabinLight).toBeLessThan(0.05);

    // Settled for good: the next visit goes straight to the setup, and the seat is kept.
    await page.reload();
    await expect(page.locator('#startSetup')).toBeVisible();
    await expect(page.locator('#startSeat')).toBeHidden();
    expect(await page.evaluate(() => window.__drivey.settings.value.seat)).toBe('close');
  });

  test('the seat can be changed in Scene settings', async ({ page }) => {
    test.skip(isPortrait(page), 'the seat only changes the view with the screen sideways');
    await openParked(page, { seat: 'close' });
    const seatBack = () => page.evaluate(() => window.__drivey.stage.framing.seatBack);
    expect(await seatBack()).toBeLessThan(0.01);
    await page.evaluate(() => window.__drivey.startScreen.skip());
    await page.click('#btnPanel');
    await page.click('[data-tab="scene"]');
    await page.click('#segSeat button:has-text("Sit back")');
    await expect.poll(seatBack).toBeGreaterThan(0.35);
  });
});
