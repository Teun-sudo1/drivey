import { expect, test as base, type Page } from '@playwright/test';

declare global {
  interface Window {
    /** Scene objects exposed by the e2e build; see the end of src/main.ts. */
    __drivey: any;
  }
}

export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const isLocal = (url: string): boolean => /^(https?:\/\/(localhost|127\.0\.0\.1|\[::1\])[:/]|blob:|data:)/.test(url);

/**
 * Fails any test during which the page throws or logs an error, and keeps
 * every test off the real internet: music services are faked per test.
 */
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      await page.route(url => !isLocal(url.href), route => route.abort('internetdisconnected'));
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => {
        // The favicon arrives with the PWA icons in M5; failed outside requests are the faked network.
        // Headless browsers have no sound card, which Chromium reports as an error.
        if (/audio device or the WebAudio renderer/.test(m.text())) return;
        if (m.type() === 'error' && !/404/.test(m.text()) && isLocal(m.location().url || 'http://localhost/')) errors.push(m.text());
      });
      await use(errors);
      expect(errors).toEqual([]);
    },
    { auto: true }
  ]
});

/** A WAV of a soft tone, for faked music streams. */
export function toneWav(seconds: number, hz = 330): Buffer {
  const rate = 8000, samples = Math.round(rate * seconds), b = Buffer.alloc(44 + samples * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + samples * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * 3000), 44 + i * 2);
  return b;
}

export { expect };

export const isPortrait = (page: Page): boolean => {
  const size = page.viewportSize()!;
  return size.height > size.width;
};

export const isPhone = (page: Page): boolean => Math.min(page.viewportSize()!.width, page.viewportSize()!.height) < 500;

/**
 * Opens the app with these settings, unless an earlier load in this test already saved some.
 * Post-processing starts off because it makes software rendering far slower; tests that
 * depend on how it looks turn it back on.
 */
export async function openApp(page: Page, settings: Record<string, unknown> = {}): Promise<void> {
  await page.addInitScript(s => {
    if (!localStorage.getItem('nd.settings')) localStorage.setItem('nd.settings', JSON.stringify(s));
  }, { bloom: false, grain: false, vignette: false, ...settings });
  await page.goto('./');
  await waitForFrames(page);
  await page.evaluate(() => window.__drivey.startScreen.skip());
}

/** Opens the app as a visitor does: parked on the start screen. */
export async function openParked(page: Page, settings: Record<string, unknown> = {}): Promise<void> {
  await page.addInitScript(s => {
    if (!localStorage.getItem('nd.settings')) localStorage.setItem('nd.settings', JSON.stringify(s));
  }, { bloom: false, grain: false, vignette: false, ...settings });
  await page.goto('./');
  await waitForFrames(page);
}

/** Resolves once the render loop has really advanced. */
export async function waitForFrames(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__drivey && window.__drivey.drive.clock > 0.1);
}

export async function update(page: Page, patch: Record<string, unknown>): Promise<void> {
  await page.evaluate(p => window.__drivey.settings.update(p), patch);
}

/** Fast-forwards the simulation without rendering, so slow machines don't make tests wait on frames. */
export async function advance(page: Page, seconds: number): Promise<void> {
  await page.evaluate(s => {
    for (let t = 0; t < s; t += 0.05) window.__drivey.simulate(0.05);
  }, seconds);
}

export async function openSceneTab(page: Page): Promise<void> {
  await page.click('#btnPanel');
  await page.click('[data-tab="scene"]');
}

/** Where a world-space point lands on screen, in CSS pixels. */
export async function screenOf(page: Page, x: number, y: number, z: number): Promise<{ x: number; y: number }> {
  return page.evaluate(([x, y, z]) => {
    const { camera } = window.__drivey.stage;
    camera.updateMatrixWorld(true);
    const v = camera.position.clone().set(x, y, z).project(camera);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (0.5 - v.y * 0.5) * innerHeight };
  }, [x, y, z]);
}

/** Bounding box of the mirror's housing on screen, once any reframing has finished. */
export async function mirrorRect(page: Page): Promise<Rect> {
  await page.waitForFunction(() => window.__drivey.stage.settled);
  return page.evaluate(() => {
    const { cockpit, stage } = window.__drivey;
    stage.camera.updateMatrixWorld(true);
    const { object, points } = cockpit.mirror.occluders[0];
    const screen = points.map((p: any) => {
      const v = object.localToWorld(p.clone()).project(stage.camera);
      return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (0.5 - v.y * 0.5) * innerHeight };
    });
    const xs = screen.map((s: any) => s.x), ys = screen.map((s: any) => s.y);
    return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
  });
}

/** A box guaranteed to lie inside the mirror, whose outline is slanted by perspective. */
export async function mirrorInnerRect(page: Page): Promise<Rect> {
  await page.waitForFunction(() => window.__drivey.stage.settled);
  return page.evaluate(() => {
    const { cockpit, stage } = window.__drivey;
    stage.camera.updateMatrixWorld(true);
    const { object, points } = cockpit.mirror.occluders[0];
    // Corners run bottom left, bottom right, top right, top left.
    const [bl, br, tr, tl] = points.map((p: any) => {
      const v = object.localToWorld(p.clone()).project(stage.camera);
      return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (0.5 - v.y * 0.5) * innerHeight };
    });
    // Generous, because on a slow machine the glass can be a frame behind this measurement.
    const inset = 8;
    return {
      left: Math.max(bl.x, tl.x) + inset,
      right: Math.min(br.x, tr.x) - inset,
      top: Math.max(tl.y, tr.y) + inset,
      bottom: Math.min(bl.y, br.y) - inset
    };
  });
}

/** How many pixels on the windshield layer are drawn in the given area, or all of it. */
export async function glassPixels(page: Page, rect?: Rect): Promise<number> {
  return page.evaluate(r => {
    // Simulated steps don't paint the glass; frames do.
    window.__drivey.windshield.draw();
    const canvas = document.querySelector<HTMLCanvasElement>('#glass')!;
    const scale = canvas.width / canvas.clientWidth;
    const x = Math.max(0, Math.floor((r?.left ?? 0) * scale)), y = Math.max(0, Math.floor((r?.top ?? 0) * scale));
    const w = Math.min(canvas.width - x, Math.ceil(((r?.right ?? canvas.clientWidth) - (r?.left ?? 0)) * scale));
    const h = Math.min(canvas.height - y, Math.ceil(((r?.bottom ?? canvas.clientHeight) - (r?.top ?? 0)) * scale));
    if (w <= 0 || h <= 0) return 0;
    const d = canvas.getContext('2d')!.getImageData(x, y, w, h).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
    return n;
  }, rect);
}

/** Average brightness (0 to 255) of the rendered scene around a screen point. */
export async function brightnessAt(page: Page, x: number, y: number, radius = 12): Promise<number> {
  return page.evaluate(([x, y, radius]) => {
    const { postfx, settings } = window.__drivey;
    const gl = document.querySelector<HTMLCanvasElement>('#gl')!;
    const scale = gl.width / gl.clientWidth;
    const c = document.createElement('canvas');
    c.width = c.height = Math.max(1, Math.round(radius * 2 * scale));
    const g = c.getContext('2d', { willReadFrequently: true })!;
    // The drawing buffer is only valid straight after a render.
    postfx.render(settings.value.bloom);
    g.drawImage(gl, (x - radius) * scale, (y - radius) * scale, c.width, c.height, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
    return sum / (d.length / 4);
  }, [x, y, radius]);
}

/** The box around an element's text rather than its whole, possibly full-width, block. */
export async function textRect(page: Page, selector: string): Promise<Rect> {
  return page.evaluate(sel => {
    const range = document.createRange();
    range.selectNodeContents(document.querySelector(sel)!);
    const { left, right, top, bottom } = range.getBoundingClientRect();
    return { left, right, top, bottom };
  }, selector);
}

export const overlaps = (a: Rect, b: Rect): boolean => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
