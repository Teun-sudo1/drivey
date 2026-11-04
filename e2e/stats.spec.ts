import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { expect, openApp, test } from './support';

const DAY = 86_400_000;

/** Ends the running focus session now, as if its time had run out. */
async function finishFocus(page: Page): Promise<void> {
  await page.click('#btnPlay');
  await page.evaluate(() => {
    const { timer } = window.__drivey;
    timer.endAt = Date.now() - 1;
    timer.tick();
  });
  await expect(page.locator('#phaseName')).toHaveText('Short break');
}

async function seed(page: Page, sessions: { daysAgo: number; minutes: number; task?: string }[]): Promise<void> {
  await page.evaluate(async ([list, day]) => {
    // Midday, so "n days ago" is the same calendar day whatever time the test runs.
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    for (const [i, s] of list.entries()) {
      await window.__drivey.stats.record({ endedAt: noon.getTime() - s.daysAgo * day - i * 1000, minutes: s.minutes, task: s.task ?? '', route: 'coast', tod: 'dusk', weather: 'fog' });
    }
  }, [sessions, DAY] as const);
}

async function openStats(page: Page): Promise<void> {
  await page.click('#btnPanel');
  await page.click('[data-tab="stats"]');
}

test.describe('stats', () => {
  test('a finished focus session is stored with its task, and both survive a reload', async ({ page }) => {
    await openApp(page);
    await page.click('#btnPanel');
    await page.fill('#taskIn', 'Write the report');
    await page.click('#btnClose');
    await expect(page.locator('#sub')).toHaveText('Write the report');

    await finishFocus(page);
    await openStats(page);
    await expect(page.locator('#stToday')).toHaveText('25');
    await expect(page.locator('#stStreak')).toHaveText('1');
    await expect(page.locator('#hist li')).toHaveCount(1);
    await expect(page.locator('#hist li span')).toHaveText('Write the report');
    await expect(page.locator('#hist li em')).toContainText('25 min');
    await expect(page.locator('#hist li em')).toContainText('Highway, clear');

    await page.reload();
    await page.evaluate(() => window.__drivey.startScreen.skip());
    await expect(page.locator('#sub')).toHaveText('Write the report');
    await openStats(page);
    await expect(page.locator('#hist li span')).toHaveText('Write the report');
    await page.click('[data-tab="timer"]');
    await expect(page.locator('#taskIn')).toHaveValue('Write the report');
  });

  test('a skipped session is not stored', async ({ page }) => {
    await openApp(page);
    await page.click('#btnPlay');
    await page.click('#btnSkip');
    await openStats(page);
    await expect(page.locator('#stToday')).toHaveText('0');
    await expect(page.locator('#hist')).toHaveClass(/empty/);
  });

  test('totals, streak and the chart follow the stored days', async ({ page }) => {
    await openApp(page);
    await seed(page, [{ daysAgo: 0, minutes: 25 }, { daysAgo: 0, minutes: 50 }, { daysAgo: 1, minutes: 30 }, { daysAgo: 2, minutes: 25 }, { daysAgo: 6, minutes: 80 }, { daysAgo: 20, minutes: 45 }]);
    await openStats(page);
    await expect(page.locator('#stToday')).toHaveText('75');
    await expect(page.locator('#stWeek')).toHaveText(String(75 + 30 + 25 + 80));
    await expect(page.locator('#stStreak')).toHaveText('3');

    const bars = page.locator('#bars .bar');
    await expect(bars).toHaveCount(7);
    // The busiest day fills the chart and the others scale against it.
    const heights = await bars.locator('i').evaluateAll(els => els.map(el => (el as HTMLElement).style.height));
    expect(heights).toEqual(['100%', '0%', '0%', '0%', '31.25%', '37.5%', '93.75%']);
    await expect(bars.last()).toHaveAttribute('aria-label', /: 75 min$/);

    await page.click('#segRange button:has-text("30 days")');
    await expect(bars).toHaveCount(30);
    await expect(bars.nth(29 - 20)).toHaveAttribute('aria-label', /: 45 min$/);
  });

  test('history exports, clears with a second tap, and imports again', async ({ page }) => {
    await openApp(page);
    await seed(page, [{ daysAgo: 1, minutes: 25, task: 'Plan the week' }, { daysAgo: 0, minutes: 50, task: 'Deep work' }]);
    await openStats(page);
    await expect(page.locator('#hist li span')).toHaveText(['Deep work', 'Plan the week']);

    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btnExport')]);
    expect(download.suggestedFilename()).toMatch(/^drivey-sessions-\d{4}-\d\d-\d\d\.json$/);
    const file = await download.path();
    const archive = JSON.parse(await readFile(file, 'utf8'));
    expect(archive).toMatchObject({ app: 'drivey', version: 1 });
    expect(archive.sessions.map((s: { task: string }) => s.task)).toEqual(['Plan the week', 'Deep work']);

    await page.click('#btnClear');
    await expect(page.locator('#btnClear')).toHaveText('Tap again to clear');
    await expect(page.locator('#hist li')).toHaveCount(2);
    await page.click('#btnClear');
    await expect(page.locator('#toast')).toHaveText('History cleared');
    await expect(page.locator('#hist li')).toHaveCount(0);
    await expect(page.locator('#stToday')).toHaveText('0');

    await page.setInputFiles('#importFile', file);
    await expect(page.locator('#toast')).toHaveText('Imported 2 sessions');
    await expect(page.locator('#hist li span')).toHaveText(['Deep work', 'Plan the week']);
    // Importing the same file again replaces rather than doubles.
    await page.setInputFiles('#importFile', file);
    await expect(page.locator('#toast')).toHaveText('Imported 2 sessions');
    await expect(page.locator('#hist li')).toHaveCount(2);
    await expect(page.locator('#stToday')).toHaveText('50');
  });

  test('a file that is not an export is refused with a message', async ({ page }) => {
    await openApp(page);
    await openStats(page);
    await page.setInputFiles('#importFile', { name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
    await expect(page.locator('#toast')).toHaveText('That file isn’t a Drivey export');
    await expect(page.locator('#hist li')).toHaveCount(0);
  });

  test('a session with nothing exported says so instead of downloading', async ({ page }) => {
    await openApp(page);
    await openStats(page);
    let downloaded = false;
    page.on('download', () => (downloaded = true));
    await page.click('#btnExport');
    await expect(page.locator('#toast')).toHaveText('No sessions to export yet');
    expect(downloaded).toBe(false);
  });
});
