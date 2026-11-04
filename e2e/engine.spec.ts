import type { Page } from '@playwright/test';
import { advance, expect, isPhone, openParked, test, update } from './support';

const engineState = (page: Page) => page.evaluate(() => window.__drivey.engine.state);
const speed = (page: Page) => page.evaluate(() => window.__drivey.drive.speed);

async function getIn(page: Page): Promise<void> {
  await page.click('#btnGetIn');
  await expect(page.locator('#ignition')).toBeVisible();
}

/** Drags the key from where it rests to a position, in degrees clockwise from 12 o'clock. */
async function turnKeyTo(page: Page, degrees: number, startDegrees = -45): Promise<void> {
  const box = (await page.locator('#ignition').boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2, r = box.width * 0.3;
  const point = (d: number) => ({ x: cx + Math.sin((d * Math.PI) / 180) * r, y: cy - Math.cos((d * Math.PI) / 180) * r });
  const start = point(startDegrees);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let d = startDegrees; d <= degrees; d += 15) {
    const p = point(d);
    await page.mouse.move(p.x, p.y);
  }
  const end = point(degrees);
  await page.mouse.move(end.x, end.y);
}

test.describe('parked on the start screen', () => {
  test('the app opens with the car stopped and the setup card up', async ({ page }) => {
    await openParked(page, { weather: 'rain' });
    await expect(page.locator('#startSetup')).toBeVisible();
    await expect(page.locator('#ignition')).toBeHidden();
    await expect(page.locator('#time')).toBeHidden();
    expect(await engineState(page)).toBe('off');

    await advance(page, 3);
    expect(await speed(page)).toBe(0);
    // Rain still falls on a parked car, but nothing has switched on.
    const parked = await page.evaluate(() => {
      const { windshield, stage, cockpit, particles } = window.__drivey;
      const lightsOn = stage.scene.children.find((c: any) => c.isSpotLight).intensity;
      return { wiperPeriod: windshield.wiperPeriod, lightsOn, power: cockpit.power, rain: particles.rain.visible };
    });
    expect(parked).toEqual({ wiperPeriod: 0, lightsOn: 0, power: expect.closeTo(0, 3), rain: true });
  });

  test('the setup card fits on screen and starts on the saved choices', async ({ page }) => {
    await openParked(page, { tod: 'dusk', weather: 'fog', driveSide: 'right' });
    await expect(page.locator('#startTod button:has-text("Dusk")')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#startWeather button:has-text("Fog")')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#startSide button:has-text("Right")')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#startRoute button')).toHaveText(['City expressway', 'Coastal road', 'Highway', 'Countryside']);

    // Nothing may need scrolling, including on a phone on its side.
    await expect(page.locator('#btnGetIn')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('#startSetup h1')).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => {
      const s = document.querySelector('#start')!;
      return s.scrollHeight <= s.clientHeight;
    })).toBe(true);
    const width = page.viewportSize()!.width;
    const card = (await page.locator('#startSetup').boundingBox())!;
    expect(card.x).toBeGreaterThanOrEqual(0);
    expect(card.x + card.width).toBeLessThanOrEqual(width);
  });

  test('choices change the scene behind the card straight away and carry into settings', async ({ page }) => {
    await openParked(page, { tod: 'night', weather: 'clear', driveSide: 'left' });
    await page.click('#startWeather button:has-text("Snow")');
    await page.click('#startTod button:has-text("Dusk")');
    await page.click('#startSide button:has-text("Right")');
    await advance(page, 10);
    const scene = await page.evaluate(() => {
      const { environment, pool } = window.__drivey;
      return { snow: environment.snowLevel, side: pool.chunks[0].group.scale.x };
    });
    expect(scene.snow).toBeGreaterThan(0.95);
    expect(scene.side).toBe(-1);
    await expect(page.locator('#sub')).toHaveText('Highway · Dusk · Snow');
    // The settings tab's copies of these controls must agree.
    await expect(page.locator('#segWeather button:has-text("Snow")')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#segSide button:has-text("Right")')).toHaveAttribute('aria-pressed', 'true');

    await page.reload();
    await expect(page.locator('#startWeather button:has-text("Snow")')).toHaveAttribute('aria-pressed', 'true');
  });

  test('the timer cannot start before the engine does', async ({ page }) => {
    test.skip(isPhone(page), 'phones have no keyboard');
    await openParked(page);
    await page.keyboard.press('Space');
    await expect(page.locator('#btnPlay')).toHaveAttribute('aria-label', 'Start');
    expect(await page.evaluate(() => window.__drivey.timer.running)).toBe(false);
  });

  test('you can go back from the key to change your mind', async ({ page }) => {
    await openParked(page);
    await getIn(page);
    await expect(page.locator('#startSetup')).toBeHidden();
    await page.click('#btnBack');
    await expect(page.locator('#startSetup')).toBeVisible();
    await expect(page.locator('#ignition')).toBeHidden();
  });
});

test.describe('the key', () => {
  test('is fully on screen', async ({ page }) => {
    await openParked(page);
    await getIn(page);
    await expect(page.locator('#ignition')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('#btnBack')).toBeInViewport({ ratio: 1 });
  });

  test('the red START arc runs under the labels without touching them', async ({ page }) => {
    await openParked(page);
    await getIn(page);
    const touching = await page.evaluate(() => {
      const arc = document.querySelector<SVGPathElement>('#startArc')!;
      const matrix = arc.getScreenCTM()!;
      const margin = (arc.getBoundingClientRect().width / 23) * 2; // half the stroke, roughly, on screen
      const labels = [...document.querySelectorAll('.key-marks text')].map(t => t.getBoundingClientRect());
      let hits = 0;
      for (let i = 0; i <= 60; i++) {
        const p = arc.getPointAtLength((arc.getTotalLength() * i) / 60).matrixTransform(matrix);
        for (const r of labels) {
          if (p.x > r.left - margin && p.x < r.right + margin && p.y > r.top - margin && p.y < r.bottom + margin) hits++;
        }
      }
      return hits;
    });
    expect(touching).toBe(0);
  });

  test('its tag hangs from the key and swings when it turns', async ({ page }) => {
    await openParked(page);
    await getIn(page);
    const hanging = () => page.locator('#keyTag').getAttribute('transform');
    const atLock = await hanging();
    await turnKeyTo(page, 0);
    await expect.poll(() => engineState(page)).toBe('acc');
    // It moved with the key, and the swing isn't simply zero.
    expect(await hanging()).not.toBe(atLock);
    await expect.poll(async () => (await hanging())!).toMatch(/rotate\(-?\d/);
    await page.mouse.up();
  });

  test('wakes the car up through each position', async ({ page }) => {
    await openParked(page);
    await getIn(page);
    await turnKeyTo(page, 0);
    await expect.poll(() => engineState(page)).toBe('acc');
    await expect(page.locator('#ignitionStatus')).toHaveText('Accessories on');
    await advance(page, 2);
    expect(await page.evaluate(() => window.__drivey.cockpit.power)).toBeGreaterThan(0.9);
    await page.mouse.up();

    await turnKeyTo(page, 45, 0);
    await expect.poll(() => engineState(page)).toBe('on');
    // Needles sweep their full travel as a self-test.
    expect(await page.evaluate(() => window.__drivey.cockpit.sweepLeft)).toBeGreaterThan(0);
    await page.mouse.up();
    expect(await speed(page)).toBe(0);
  });

  test('let go too early and it springs back to ON without starting', async ({ page }) => {
    await openParked(page);
    await getIn(page);
    await turnKeyTo(page, 90);
    await expect.poll(() => engineState(page)).toBe('cranking');
    await page.mouse.up();
    await expect.poll(() => engineState(page)).toBe('on');
    await page.waitForTimeout(1200);
    expect(await engineState(page)).toBe('on');
    await expect(page.locator('#startKey')).toBeVisible();
    await expect(page.locator('#time')).toBeHidden();
  });

  test('held at START the engine catches and you drive off', async ({ page }) => {
    await openParked(page);
    await getIn(page);
    await turnKeyTo(page, 90);
    await expect.poll(() => engineState(page)).toBe('running');
    await page.mouse.up();

    await expect(page.locator('#start')).toHaveClass(/gone/);
    await expect(page.locator('#time')).toBeVisible();
    await expect(page.locator('#btnPlay')).toBeVisible();
    await expect(page.locator('#start')).toHaveAttribute('inert', '');

    await advance(page, 10);
    expect(await speed(page)).toBeGreaterThan(15);
    const lights = await page.evaluate(() => window.__drivey.stage.scene.children.find((c: any) => c.isSpotLight).intensity);
    expect(lights).toBeGreaterThan(100);
  });

  test('a tap turns the key for you', async ({ page }) => {
    await openParked(page);
    await getIn(page);
    await page.locator('#ignition').click();
    await expect.poll(() => engineState(page)).toBe('running');
    await expect(page.locator('#start')).toHaveClass(/gone/);
  });

  test('the keyboard can start the engine too', async ({ page }) => {
    test.skip(isPhone(page), 'phones have no keyboard');
    await openParked(page);
    await getIn(page);
    await page.locator('#ignition').focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => engineState(page)).toBe('running');
  });

  test('wipers start with the ignition in the rain', async ({ page }) => {
    await openParked(page, { weather: 'rain' });
    await advance(page, 1);
    expect(await page.evaluate(() => window.__drivey.windshield.wiperPeriod)).toBe(0);
    await page.evaluate(() => window.__drivey.engine.set('on'));
    await advance(page, 0.2);
    expect(await page.evaluate(() => window.__drivey.windshield.wiperPeriod)).toBeGreaterThan(0);
  });

  test('every visit starts parked, even after driving', async ({ page }) => {
    await openParked(page);
    await getIn(page);
    await page.locator('#ignition').click();
    await expect.poll(() => engineState(page)).toBe('running');
    await update(page, { weather: 'snow' });

    await page.reload();
    await page.waitForFunction(() => window.__drivey);
    await expect(page.locator('#startSeat')).toBeVisible();
    expect(await engineState(page)).toBe('off');
    // Each visit opens on the Drivey screen again.
    await page.click('#btnIntro');
    await page.click('#btnSeated');
    await expect(page.locator('#startSetup')).toBeVisible();
    await expect(page.locator('#startWeather button:has-text("Snow")')).toHaveAttribute('aria-pressed', 'true');
  });
});
