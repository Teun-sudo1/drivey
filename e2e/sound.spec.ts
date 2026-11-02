import type { Page } from '@playwright/test';
import { advance, expect, isPhone, openApp, openParked, test, update } from './support';

/** Sets the drive up and starts the engine with a tap on the key, as a visitor would. */
async function startDriving(page: Page, settings: Record<string, unknown> = {}): Promise<void> {
  await openParked(page, { weather: 'clear', ...settings });
  await page.click('#btnGetIn');
  await page.locator('#ignition').click();
  await expect.poll(() => page.evaluate(() => window.__drivey.engine.state)).toBe('running');
}

test.describe('sound', () => {
  test('nothing makes a sound until the first tap on the start screen', async ({ page }) => {
    await openParked(page);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.__drivey.audio.graph)).toBeNull();
    await page.click('#startTod button:has-text("Dusk")');
    await expect.poll(() => page.evaluate(() => window.__drivey.audio.graph?.ctx.state)).toBe('running');
  });

  test('the starter turns over while cranking, then the engine hums', async ({ page }) => {
    await openParked(page, { weather: 'clear' });
    await page.click('#btnGetIn');
    const box = (await page.locator('#ignition').boundingBox())!;
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2, r = box.width * 0.3;
    const at = (d: number) => [cx + Math.sin((d * Math.PI) / 180) * r, cy - Math.cos((d * Math.PI) / 180) * r] as const;
    await page.mouse.move(...at(-45));
    await page.mouse.down();
    for (let d = -45; d <= 90; d += 15) await page.mouse.move(...at(d));
    await expect.poll(() => page.evaluate(() => window.__drivey.engine.state)).toBe('cranking');
    await expect.poll(() => page.evaluate(() => window.__drivey.ambience.starter.gain.value)).toBeGreaterThan(0.3);
    await expect.poll(() => page.evaluate(() => window.__drivey.engine.state)).toBe('running');
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.__drivey.ambience.starter.gain.value)).toBeLessThan(0.05);
    await expect.poll(() => page.evaluate(() => window.__drivey.audio.graph.channels.engine.gain.value)).toBeGreaterThan(0.1);
  });

  test('the wipers swish once per sweep, in step with the blades, and not when parked', async ({ page }) => {
    await startDriving(page, { weather: 'heavy' });
    const swishes = (seconds: number) => page.evaluate(s => {
      const { effects, windshield, simulate } = window.__drivey;
      let swish = 0, sweeps = 0, phase = windshield.wiperPhase;
      const original = effects.swish;
      effects.swish = () => swish++;
      for (let t = 0; t < s; t += 0.05) {
        simulate(0.05);
        const now = windshield.wiperPhase;
        // A sweep out starts as the phase leaves 0, and the sweep back as it passes the middle.
        if ((phase === 0 && now > 0) || (phase < 0.5 && now >= 0.5)) sweeps++;
        phase = now;
      }
      effects.swish = original;
      return { swish, sweeps };
    }, seconds);
    const rain = await swishes(10);
    expect(rain.sweeps).toBeGreaterThan(10);
    expect(rain.swish).toBe(rain.sweeps);
    await update(page, { weather: 'clear' });
    await advance(page, 3);
    expect((await swishes(10)).swish).toBe(0);
  });

  test('ending a phase plays the chime', async ({ page }) => {
    await openApp(page);
    await page.locator('#btnPlay').click();
    const chimed = await page.evaluate(() => {
      const { effects, timer } = window.__drivey;
      let n = 0;
      effects.chime = () => n++;
      timer.endAt = Date.now() - 1;
      timer.tick();
      return n;
    });
    expect(chimed).toBe(1);
  });

  test('M mutes and unmutes everything, and it is remembered', async ({ page }) => {
    test.skip(isPhone(page), 'phones have no keyboard');
    await startDriving(page);
    const master = () => page.evaluate(() => window.__drivey.audio.graph.master.gain.value);
    await page.keyboard.press('m');
    await expect(page.locator('#toast')).toHaveText('Sound off');
    await expect.poll(master).toBeLessThan(0.01);
    await page.reload();
    expect(await page.evaluate(() => window.__drivey.settings.value.muted)).toBe(true);
    await page.keyboard.press('m');
    await expect(page.locator('#toast')).toHaveText('Sound on');
  });
});

test.describe('ambient mixer', () => {
  test('sliders set each channel, and the scene shapes them unless told not to', async ({ page }) => {
    await startDriving(page, { weather: 'rain' });
    await page.click('#btnPanel');
    await page.click('[data-tab="sound"]');
    const level = (ch: string) => page.evaluate(c => window.__drivey.audio.graph.channels[c].gain.value, ch);

    await page.getByLabel('Rain on glass volume').fill('1');
    await expect.poll(() => level('rain')).toBeGreaterThan(0.35);
    await update(page, { weather: 'clear' });
    await expect.poll(() => level('rain')).toBeLessThan(0.02);
    // With the scene not following, the user's level stands even in clear weather.
    await page.locator('.tog[data-k="follow"]').click();
    await expect.poll(() => level('rain')).toBeGreaterThan(0.9);
    await page.getByLabel('Wind volume').fill('0');
    await expect.poll(() => level('wind')).toBeLessThan(0.02);
  });

  test('a mix can be saved, loaded and deleted, and survives a reload', async ({ page }) => {
    await openApp(page);
    await page.click('#btnPanel');
    await page.click('[data-tab="sound"]');
    await page.getByLabel('Rain on glass volume').fill('0.9');
    await page.fill('#presetName', 'Storm');
    await page.press('#presetName', 'Enter');
    await expect(page.locator('#toast')).toHaveText('Mix "Storm" saved');
    await page.getByLabel('Rain on glass volume').fill('0.1');

    await page.reload();
    await page.waitForFunction(() => window.__drivey);
    await page.evaluate(() => window.__drivey.startScreen.skip());
    await page.click('#btnPanel');
    await page.click('[data-tab="sound"]');
    await page.click('#mixPresets button:has-text("Storm")');
    await expect(page.getByLabel('Rain on glass volume')).toHaveValue('0.9');
    await page.getByLabel('Delete mix Storm').click();
    await expect(page.locator('#mixPresets button')).toHaveCount(0);
  });
});

const faders = (page: Page): Promise<number[]> => page.evaluate(() => window.__drivey.player.decks.map((d: any) => d.fader.gain.value));
const sequencers = (page: Page) => page.evaluate(() => window.__drivey.player.decks.map((d: any) => d.music.playing));

test.describe('timer buttons', () => {
  test('click like dashboard switches when pressed, but not when a phase ends by itself', async ({ page }) => {
    await startDriving(page);
    await page.evaluate(() => {
      const { effects } = window.__drivey;
      (window as any).presses = [];
      effects.press = (start: boolean) => (window as any).presses.push(start);
    });
    await page.click('#btnPlay');
    await page.click('#btnPlay');
    await page.click('#btnSkip');
    await page.click('#btnReset');
    await page.click('#btnPlay');
    await page.evaluate(() => {
      const { timer } = window.__drivey;
      timer.endAt = Date.now() - 1;
      timer.tick();
    });
    expect(await page.evaluate(() => (window as any).presses)).toEqual([true, false, false, false, true]);
  });
});

test.describe('music', () => {
  test('the 80s rock station plays like any other style', async ({ page }) => {
    await startDriving(page);
    await page.click('#btnPanel');
    await page.click('[data-tab="sound"]');
    await page.click('#segStyle button:has-text("80s rock")');
    await expect(page.locator('#npTitle')).toHaveText('80s rock beats');
    await expect.poll(async () => (await sequencers(page)).filter(Boolean).length).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__drivey.player.style)).toBe('rock80s');
  });

  test('quiet beats play while setting up and come up with the engine, made without a single network request', async ({ page }) => {
    const outside: string[] = [];
    page.on('request', r => {
      if (!/^(http:\/\/localhost|blob:|data:)/.test(r.url())) outside.push(r.url());
    });
    await openParked(page, { mix: { music: 0.6 } });
    expect(await page.evaluate(() => window.__drivey.player.playing)).toBe(false);
    await page.click('#btnGetIn');
    await expect.poll(async () => Math.max(...(await faders(page)))).toBeGreaterThan(0.9);
    // A third of the mixer's level until the engine runs.
    const music = () => page.evaluate(() => window.__drivey.audio.graph.channels.music.gain.value);
    await expect.poll(music).toBeCloseTo(0.6 * 0.35, 2);
    await page.locator('#ignition').click();
    await expect.poll(() => page.evaluate(() => window.__drivey.engine.state)).toBe('running');
    await expect.poll(music).toBeCloseTo(0.6, 2);
    expect((await sequencers(page)).filter(Boolean)).toHaveLength(1);
    await page.click('#btnPanel');
    await page.click('[data-tab="sound"]');
    await expect(page.locator('#npTitle')).toHaveText('Chillhop beats');
    await expect(page.locator('#npDetail')).toHaveText('Variation 1 · playing');
    expect(outside).toEqual([]);
  });

  test('switching music off fades it out and stops making it, and is remembered', async ({ page }) => {
    await startDriving(page);
    await expect.poll(async () => Math.max(...(await faders(page)))).toBeGreaterThan(0.9);
    await page.click('#btnPanel');
    await page.click('[data-tab="sound"]');
    await page.click('#btnMusic');
    await expect(page.locator('#btnMusic')).toHaveAttribute('aria-label', 'Play music');
    await expect(page.locator('#npDetail')).toHaveText('Variation 1 · switched off');
    await expect.poll(async () => Math.max(...(await faders(page)))).toBeLessThan(0.01);
    // Silent and idle: nothing left scheduling notes.
    await expect.poll(() => sequencers(page)).toEqual([false, false]);

    await page.reload();
    await page.waitForFunction(() => window.__drivey);
    await page.click('#btnGetIn');
    await page.locator('#ignition').click();
    await expect.poll(() => page.evaluate(() => window.__drivey.engine.state)).toBe('running');
    expect(await page.evaluate(() => window.__drivey.player.playing)).toBe(false);
  });

  test('changing style crossfades into the new one, which is remembered', async ({ page }) => {
    await startDriving(page);
    await expect.poll(async () => Math.max(...(await faders(page)))).toBeGreaterThan(0.9);
    await page.click('#btnPanel');
    await page.click('[data-tab="sound"]');
    await page.click('#segStyle button:has-text("Synthwave")');
    // Both audible at once is the crossfade.
    await expect.poll(async () => (await faders(page)).every(g => g > 0.05)).toBe(true);
    await expect(page.locator('#npTitle')).toHaveText('Synthwave beats');
    await expect.poll(async () => (await faders(page)).filter(g => g > 0.9)).toHaveLength(1);
    await expect.poll(() => sequencers(page)).toEqual(expect.arrayContaining([true, false]));
    await page.reload();
    await expect(page.locator('#segStyle button:has-text("Synthwave")')).toHaveAttribute('aria-pressed', 'true');
  });

  test('a new variation moves to another key', async ({ page }) => {
    await startDriving(page);
    await page.click('#btnPanel');
    await page.click('[data-tab="sound"]');
    const key = () => page.evaluate(() => window.__drivey.player.transpose);
    await expect.poll(async () => Math.max(...(await faders(page)))).toBeGreaterThan(0.9);
    let previous = await key();
    await page.click('#btnNext');
    // Both audible at once is the crossfade.
    await expect.poll(async () => (await faders(page)).every(g => g > 0.05)).toBe(true);
    expect(await key()).not.toBe(previous);
    previous = await key();
    // Random picks that keep landing on the same key, unless the player insists on a new one.
    await page.evaluate(() => {
      let i = 0;
      Math.random = () => [0.9, 0.9, 0.9, 0.1][i++ % 4];
    });
    for (let i = 3; i <= 5; i++) {
      await page.click('#btnNext');
      await expect(page.locator('#npDetail')).toHaveText(`Variation ${i} · playing`);
      // Each variation is in a different key from the one before it.
      const now = await key();
      expect(now).not.toBe(previous);
      previous = now;
    }
  });
});
