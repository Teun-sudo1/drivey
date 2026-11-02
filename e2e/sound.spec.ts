import type { Page } from '@playwright/test';
import { advance, expect, isPhone, openApp, openParked, test, toneWav, update } from './support';

const MEDIA = 'https://media.test';

/**
 * Serves faked music files; any name with "dead" in it is missing. Without
 * CORS, requests made in CORS mode are refused, as such a server's would be
 * (Playwright would otherwise add the CORS headers itself).
 */
async function serveMedia(page: Page, { cors = true, seconds = 40 } = {}): Promise<void> {
  const body = toneWav(seconds);
  await page.route(`${MEDIA}/**`, async route => {
    const corsMode = (await route.request().headerValue('sec-fetch-mode')) === 'cors' || !!(await route.request().headerValue('origin'));
    if (route.request().url().includes('dead') || (!cors && corsMode)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: 'audio/wav', headers: { 'access-control-allow-origin': '*' }, body });
  });
}

const jamendoTrack = (id: string, title: string) => ({
  id,
  name: title,
  artist_name: `Artist ${id}`,
  audio: `${MEDIA}/${id}.wav`,
  shareurl: `https://www.jamendo.com/track/${id}`,
  license_ccurl: 'https://creativecommons.org/licenses/by-nc-sa/3.0/'
});

/** Fakes Jamendo with these tracks on the first page, or an HTTP status; returns how often it was asked. */
async function mockJamendo(page: Page, reply: ReturnType<typeof jamendoTrack>[] | number): Promise<() => number> {
  let calls = 0;
  await page.route('https://api.jamendo.com/**', route => {
    calls++;
    if (typeof reply === 'number') return route.fulfill({ status: reply, body: '' });
    const first = new URL(route.request().url()).searchParams.get('offset') === '0';
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ headers: { code: 0 }, results: first ? reply : [] }) });
  });
  return () => calls;
}

const station = (id: string, name: string, bitrate = 128) => ({ stationuuid: id, name, url_resolved: `${MEDIA}/${id}.wav`, homepage: `https://${id}.radio.test/`, bitrate, lastcheckok: 1 });

/**
 * Fakes Radio Browser with these stations. The official mirror list is left
 * unreachable, so the app uses its built-in mirrors in order, and the first of
 * those is broken: every radio test goes through a failover.
 */
async function mockRadio(page: Page, stations: ReturnType<typeof station>[]): Promise<void> {
  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  await page.route('https://de1.api.radio-browser.info/**', route => route.fulfill({ status: 500, body: '' }));
  await page.route('https://nl1.api.radio-browser.info/**', route => route.fulfill(json(stations)));
}

/** Sets the drive up and starts the engine with a tap on the key, as a visitor would. */
async function startDriving(page: Page, settings: Record<string, unknown> = {}): Promise<void> {
  await openParked(page, { weather: 'clear', ...settings });
  await page.click('#btnGetIn');
  await page.locator('#ignition').click();
  await expect.poll(() => page.evaluate(() => window.__drivey.engine.state)).toBe('running');
}

const current = (page: Page) => page.evaluate(() => {
  const t = window.__drivey.player.current;
  return t && { key: t.key, provider: t.provider, kind: t.kind };
});

test.describe('sound', () => {
  test('nothing makes a sound until the key is turned', async ({ page }) => {
    await openParked(page);
    await page.click('#btnGetIn');
    expect(await page.evaluate(() => window.__drivey.audio.graph)).toBeNull();
    await page.locator('#ignition').click();
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

test.describe('music', () => {
  test('Jamendo tracks play with their credits once the engine runs', async ({ page }) => {
    await serveMedia(page);
    await mockJamendo(page, [jamendoTrack('101', 'Night Bus'), jamendoTrack('102', 'Slow Lights')]);
    await startDriving(page, { sources: { chillhop: 'tracks' } });
    await expect.poll(() => current(page)).toMatchObject({ provider: 'jamendo', kind: 'track' });
    await page.click('#btnPanel');
    await page.click('[data-tab="sound"]');
    await expect(page.locator('#npTitle')).toHaveText(/Night Bus|Slow Lights/);
    await expect(page.locator('#npCredit a').first()).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-nc-sa/3.0/');
    await expect(page.locator('#npCredit')).toContainText('CC BY-NC-SA 3.0');
    await page.click('#credits summary');
    await expect(page.locator('#creditList li')).toHaveCount(1);
    await expect(page.locator('#creditList li a').first()).toHaveAttribute('href', /jamendo\.com\/track\/10[12]/);
  });

  test('music waits for the engine and stops when switched off, which is remembered', async ({ page }) => {
    await serveMedia(page);
    await mockJamendo(page, [jamendoTrack('101', 'Night Bus')]);
    await openParked(page, { sources: { chillhop: 'tracks' } });
    await page.click('#btnGetIn');
    expect(await page.evaluate(() => window.__drivey.player.playing)).toBe(false);
    await page.locator('#ignition').click();
    await expect.poll(() => page.evaluate(() => window.__drivey.player.status)).toBe('playing');

    await page.click('#btnPanel');
    await page.click('[data-tab="sound"]');
    await page.click('#btnMusic');
    await expect(page.locator('#btnMusic')).toHaveAttribute('aria-label', 'Play music');
    expect(await page.evaluate(() => window.__drivey.player.playing)).toBe(false);
    await page.reload();
    await page.waitForFunction(() => window.__drivey);
    await page.click('#btnGetIn');
    await page.locator('#ignition').click();
    await expect.poll(() => page.evaluate(() => window.__drivey.engine.state)).toBe('running');
    expect(await page.evaluate(() => window.__drivey.player.playing)).toBe(false);
  });

  test('likes are kept, and a banned track never comes back', async ({ page }) => {
    await serveMedia(page);
    await mockJamendo(page, [jamendoTrack('101', 'Night Bus'), jamendoTrack('102', 'Slow Lights')]);
    await startDriving(page, { sources: { chillhop: 'tracks' } });
    await expect.poll(() => current(page)).toMatchObject({ provider: 'jamendo' });
    await page.click('#btnPanel');
    await page.click('[data-tab="sound"]');
    await page.click('#btnLike');
    await expect(page.locator('#btnLike')).toHaveAttribute('aria-pressed', 'true');
    const banned = (await current(page))!.key;
    await page.click('#btnNever');
    await expect(page.locator('#toast')).toContainText("Won't play");
    await expect.poll(async () => (await current(page))?.key).not.toBe(banned);

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('nd.music')!));
    expect(stored.never).toEqual([banned]);
    // Banning a liked track unlikes it.
    expect(stored.liked).toEqual([]);
    // However long it plays on, the banned track doesn't return.
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.__drivey.player.next());
      await expect.poll(() => page.evaluate(() => window.__drivey.player.status)).toBe('playing');
      expect((await current(page))?.key).not.toBe(banned);
    }
  });

  test('when Jamendo rate-limits us, music falls back quietly and Jamendo is left alone', async ({ page }) => {
    await serveMedia(page);
    const calls = await mockJamendo(page, 429);
    await startDriving(page, { sources: { chillhop: 'tracks' } });
    await expect(page.locator('#toast')).toHaveText('Jamendo unavailable. Playing generated music.');
    await expect.poll(() => current(page)).toMatchObject({ kind: 'generated' });
    const asked = calls();
    await page.evaluate(() => window.__drivey.player.configure('jazzy', 'tracks'));
    await expect.poll(() => current(page)).toMatchObject({ kind: 'generated' });
    expect(calls()).toBe(asked);
  });

  test('with no network at all, generated music plays and nothing breaks', async ({ page }) => {
    await startDriving(page, { sources: { chillhop: 'mix' } });
    await expect.poll(() => current(page)).toMatchObject({ provider: 'generated', kind: 'generated' });
    await expect.poll(() => page.evaluate(() => window.__drivey.player.status)).toBe('playing');
  });

  test('live radio skips a dead stream and survives a broken mirror', async ({ page }) => {
    await serveMedia(page);
    await mockRadio(page, [station('dead1', 'Gone FM', 320), station('live1', 'Lofi Live', 128)]);
    await startDriving(page, { sources: { chillhop: 'radio' } });
    await expect.poll(() => current(page), { timeout: 30000 }).toMatchObject({ key: 'radio:live1', kind: 'stream' });
  });

  test('a slow stream still gets its chance to start', async ({ page }) => {
    const body = toneWav(30);
    await page.route(`${MEDIA}/**`, async route => {
      await new Promise(r => setTimeout(r, 1500));
      await route.fulfill({ status: 200, contentType: 'audio/wav', headers: { 'access-control-allow-origin': '*' }, body }).catch(() => undefined);
    });
    await mockRadio(page, [station('slow1', 'Slow FM')]);
    await startDriving(page, { sources: { chillhop: 'radio' } });
    await expect.poll(() => current(page), { timeout: 30000 }).toMatchObject({ key: 'radio:slow1' });
  });

  test('track details from outside services are shown as text, never as markup or script links', async ({ page }) => {
    await serveMedia(page);
    const evil = { ...jamendoTrack('666', '<img src=x onerror="window.__pwned=1">Song'), shareurl: 'javascript:window.__pwned=1' };
    await mockJamendo(page, [evil]);
    await startDriving(page, { sources: { chillhop: 'tracks' } });
    await expect.poll(() => current(page)).toMatchObject({ key: 'jamendo:666' });
    await page.click('#btnPanel');
    await page.click('[data-tab="sound"]');
    await expect(page.locator('#npTitle')).toHaveText('<img src=x onerror="window.__pwned=1">Song');
    await page.click('#credits summary');
    await expect(page.locator('#creditList li')).toContainText('<img');
    expect(await page.locator('#tab-sound img').count()).toBe(0);
    expect(await page.locator('#tab-sound a[href^="javascript"]').count()).toBe(0);
    expect(await page.evaluate(() => (window as any).__pwned)).toBeUndefined();
  });

  test('a stream without CORS still plays, outside Web Audio', async ({ page }) => {
    await serveMedia(page, { cors: false });
    await mockRadio(page, [station('live1', 'Lofi Live')]);
    await startDriving(page, { sources: { chillhop: 'radio' } });
    await expect.poll(() => current(page), { timeout: 30000 }).toMatchObject({ key: 'radio:live1' });
    expect(await page.evaluate(() => window.__drivey.player.decks.find((d: any) => d.track)?.mode)).toBe('direct');
  });

  test('tracks crossfade into the next one', async ({ page }) => {
    await serveMedia(page, { seconds: 7 });
    await mockJamendo(page, [jamendoTrack('201', 'One'), jamendoTrack('202', 'Two'), jamendoTrack('203', 'Three')]);
    await startDriving(page, { sources: { chillhop: 'tracks' } });
    const first = await expect.poll(() => current(page)).toMatchObject({ provider: 'jamendo' }).then(() => current(page));
    // Both decks audible at once is the crossfade.
    await expect.poll(() => page.evaluate(() => window.__drivey.player.decks.every((d: any) => d.level > 0.05)), { timeout: 20000 }).toBe(true);
    await expect.poll(async () => (await current(page))?.key, { timeout: 20000 }).not.toBe(first!.key);
  });
});
