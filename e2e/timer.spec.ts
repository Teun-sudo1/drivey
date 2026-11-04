import { advance, expect, isPhone, openApp, test } from './support';

test.describe('timer', () => {
  test('starts, counts down and pauses', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('#time')).toHaveText('25:00');
    await expect(page).toHaveTitle('Drivey');

    await page.click('#btnPlay');
    await expect(page.locator('#btnPlay')).toHaveAttribute('aria-label', 'Pause');
    await expect(page.locator('#time')).not.toHaveText('25:00');
    await expect(page).toHaveTitle(/^\d\d:\d\d · Drivey$/);

    await page.click('#btnPlay');
    await expect(page.locator('#btnPlay')).toHaveAttribute('aria-label', 'Start');
    const paused = await page.textContent('#time');
    await page.waitForTimeout(1500);
    await expect(page.locator('#time')).toHaveText(paused!);
  });

  test('skip moves to the break and reset restores its length', async ({ page }) => {
    await openApp(page);
    await page.click('#btnSkip');
    await expect(page.locator('#phaseName')).toHaveText('Short break');
    await expect(page.locator('#time')).toHaveText('05:00');
    await expect(page.locator('#toast')).toHaveText('Skipped to short break');

    await page.click('#btnPlay');
    await expect(page.locator('#time')).not.toHaveText('05:00');
    await page.click('#btnReset');
    await expect(page.locator('#time')).toHaveText('05:00');
  });

  test('finishing a session announces the break and slows the car', async ({ page }) => {
    await openApp(page, { route: 'city' });
    await advance(page, 20);
    expect(await page.evaluate(() => window.__drivey.drive.speed)).toBeGreaterThan(20);
    await page.click('#btnPlay');
    await page.evaluate(() => {
      const { timer } = window.__drivey;
      timer.endAt = Date.now() - 1;
      timer.tick();
    });
    await expect(page.locator('#phaseName')).toHaveText('Short break');
    await expect(page.locator('#toast')).toHaveText('Nice work. Time for a break.');
    await expect(page.locator('#btnPlay')).toHaveAttribute('aria-label', 'Start');
    await advance(page, 20);
    expect(await page.evaluate(() => window.__drivey.drive.speed)).toBeLessThan(15);
  });

  test('duration edits apply and survive a reload', async ({ page }) => {
    await openApp(page);
    await page.click('#btnPanel');
    await page.click('.num[data-n="focus"] button[aria-label^="Increase"]');
    await expect(page.locator('#time')).toHaveText('30:00');
    await page.click('.tog[data-k="auto"]');
    await expect(page.locator('.tog[data-k="auto"] .sw')).toHaveAttribute('aria-checked', 'true');

    await page.reload();
    await expect(page.locator('#time')).toHaveText('30:00');
    await expect(page.locator('.tog[data-k="auto"] .sw')).toHaveAttribute('aria-checked', 'true');
  });
});

test.describe('keyboard shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(isPhone(page), 'phones have no keyboard');
    await openApp(page);
  });

  test('space starts and pauses, even after clicking another button', async ({ page }) => {
    await page.keyboard.press('Space');
    await expect(page.locator('#btnPlay')).toHaveAttribute('aria-label', 'Pause');
    await page.click('#btnPanel');
    await page.click('#btnClose');
    await page.keyboard.press('Space');
    await expect(page.locator('#btnPlay')).toHaveAttribute('aria-label', 'Start');
  });

  test('space still works right after clicking skip, and does not skip again', async ({ page }) => {
    await page.click('#btnSkip');
    await expect(page.locator('#phaseName')).toHaveText('Short break');
    await page.keyboard.press('Space');
    await expect(page.locator('#btnPlay')).toHaveAttribute('aria-label', 'Pause');
    await expect(page.locator('#phaseName')).toHaveText('Short break');
  });

  test('a keyboard user pressing space on a focused button activates that button', async ({ page }) => {
    // Safari doesn't Tab to buttons by default, so focus it directly once Tab has marked keyboard use.
    await page.keyboard.press('Tab');
    await page.focus('#btnPanel');
    await page.keyboard.press('Space');
    await expect(page.locator('#panel')).not.toHaveAttribute('inert', '');
    await expect(page.locator('#btnPlay')).toHaveAttribute('aria-label', 'Start');
  });

  test('H hides the UI and brings it back', async ({ page }) => {
    await page.keyboard.press('h');
    await expect(page.locator('body')).toHaveClass(/idle/);
    await page.keyboard.press('h');
    await expect(page.locator('body')).not.toHaveClass(/idle/);
  });
});

test('the UI fades during a session and movement brings it back', async ({ page }) => {
  await openApp(page);
  await page.click('#btnPlay');
  await expect(page.locator('body')).toHaveClass(/idle/);
  await page.mouse.move(40, 40);
  await expect(page.locator('body')).not.toHaveClass(/idle/);
});
