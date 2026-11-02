import { expect, openApp, openParked, test } from './support';

test.describe('end of a session', () => {
  test('a card sums up the finished session and the day, and goes when the break starts', async ({ page }) => {
    await openApp(page, { task: 'Write the report' });
    await page.click('#btnPlay');
    await page.evaluate(() => {
      const { timer } = window.__drivey;
      timer.endAt = Date.now() - 1;
      timer.tick();
    });
    const card = page.locator('#sessionCard');
    await expect(card).not.toHaveClass(/hidden/);
    await expect(page.locator('#cardTask')).toHaveText('Write the report');
    await expect(card).toContainText('25 min · 25 min today · 1-day streak');
    await page.click('#btnPlay');
    await expect(card).toHaveClass(/hidden/);
  });

  test('the chime is booked on the audio clock as the phase starts, and called off on pause', async ({ page }) => {
    await openApp(page);
    // Sound needs a tap first.
    await page.evaluate(() => window.__drivey.audio.unlock());
    const log = await page.evaluate(async () => {
      const { effects, timer } = window.__drivey;
      const calls: { delay: number; cancelled: boolean }[] = [];
      const real = effects.chime.bind(effects);
      effects.chime = (delay = 0) => {
        const entry = { delay, cancelled: false };
        calls.push(entry);
        const cancel = real(delay);
        return () => {
          entry.cancelled = true;
          cancel?.();
        };
      };
      timer.start();
      timer.pause();
      timer.start();
      // Brings the end forward, which books the chime again for the new time.
      timer.endAt = Date.now() + 50;
      timer.notify();
      return new Promise<typeof calls>(resolve => setTimeout(() => {
        // The phase ends: the booked chime plays, and none is added on top.
        timer.tick();
        resolve(calls);
      }, 100));
    });
    expect(log).toHaveLength(3);
    expect(log[0]).toMatchObject({ cancelled: true });
    expect(log[0].delay).toBeCloseTo(25 * 60, -1);
    expect(log[1]).toMatchObject({ cancelled: true });
    expect(log[2]).toMatchObject({ cancelled: false });
    expect(log[2].delay).toBeLessThan(0.1);
  });

  test('without sound when the phase started, it chimes at the end instead', async ({ page }) => {
    await openApp(page);
    const chimes = await page.evaluate(() => {
      const { effects, timer, audio } = window.__drivey;
      let n = 0;
      // Counts only chimes that would be heard.
      effects.chime = () => (audio.graph ? (n++, () => undefined) : null);
      timer.start();
      audio.unlock();
      timer.endAt = Date.now() - 1;
      timer.tick();
      return n;
    });
    expect(chimes).toBe(1);
  });
});

test.describe('first drive', () => {
  test('tips appear once the engine runs, and never again once dismissed', async ({ page }) => {
    await openParked(page, { tipsSeen: false });
    await expect(page.locator('#tips')).toHaveClass(/hidden/);
    await page.evaluate(() => window.__drivey.startScreen.skip());
    await expect(page.locator('#tips')).not.toHaveClass(/hidden/);
    await page.click('#btnTips');
    await expect(page.locator('#tips')).toHaveClass(/hidden/);
    await page.reload();
    await page.evaluate(() => window.__drivey.startScreen.skip());
    await page.waitForTimeout(300);
    await expect(page.locator('#tips')).toHaveClass(/hidden/);
  });
});
