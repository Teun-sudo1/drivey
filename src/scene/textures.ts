import * as THREE from 'three';
import { colorTexture, createCanvas } from '../lib/canvas';
import { pick, rand } from '../lib/math';

type Stops = readonly (readonly [position: number, value: number])[];

function ramp(stops: Stops, t: number): number {
  for (let i = 1; i < stops.length; i++) {
    const [p0, v0] = stops[i - 1], [p1, v1] = stops[i];
    if (t <= p1) return v0 + ((v1 - v0) * (t - p0)) / (p1 - p0);
  }
  return stops[stops.length - 1][1];
}

/**
 * A white texture with computed alpha. Canvas gradients can't be used for these:
 * in Safari they come out noisy, which additive blending turns into visible speckle.
 */
function alphaTexture(w: number, h: number, alpha: (x: number, y: number) => number): THREE.CanvasTexture {
  const { canvas, ctx } = createCanvas(w, h);
  const image = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
      image.data[i + 3] = Math.round(alpha(x + 0.5, y + 0.5) * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

const GLOW_FALLOFF: Stops = [[0, 1], [0.18, 0.55], [0.5, 0.12], [1, 0]];
export const GLOW = alphaTexture(128, 128, (x, y) => ramp(GLOW_FALLOFF, Math.min(1, Math.hypot(x - 64, y - 64) / 64)));

/** Grey noise that repeats seamlessly, for breaking up road surfaces. */
export const TILING_NOISE = (() => {
  const size = 256;
  const data = new Uint8Array(size * size);
  const smooth = (t: number): number => t * t * (3 - 2 * t);
  const octaves = [[4, 0.5], [8, 0.27], [16, 0.15], [32, 0.08]] as const;
  const values = new Float32Array(size * size);
  for (const [period, weight] of octaves) {
    const lattice = Array.from({ length: period * period }, () => Math.random());
    const at = (x: number, y: number): number => lattice[(y % period) * period + (x % period)];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * period, fy = (y / size) * period;
        const ix = Math.floor(fx), iy = Math.floor(fy), tx = smooth(fx - ix), ty = smooth(fy - iy);
        const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * tx;
        const bottom = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * tx;
        values[y * size + x] += (top + (bottom - top) * ty) * weight;
      }
    }
  }
  for (let i = 0; i < data.length; i++) data[i] = Math.round(values[i] * 255);
  const t = new THREE.DataTexture(data, size, size, THREE.RedFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
})();

/** Daylight appearance of a building: pale walls with dark glass, on the same grid as the lit windows. */
export const FACADE = (() => {
  const { canvas, ctx } = createCanvas(128, 256);
  ctx.fillStyle = '#d6d3cc';
  ctx.fillRect(0, 0, 128, 256);
  ctx.fillStyle = '#2a333f';
  for (let r = 0; r < 16; r++) for (let k = 0; k < 8; k++) ctx.fillRect(k * 16 + 3, r * 16 + 4, 10, 8);
  const t = colorTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();

export function windowTexture(lit: number): THREE.CanvasTexture {
  const { canvas, ctx } = createCanvas(128, 256);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 128, 256);
  const cols = ['#ffd59a', '#ffe8c2', '#cfe6ff', '#9fd6ff', '#ffb870', '#fff4e0'];
  for (let r = 0; r < 16; r++) {
    for (let k = 0; k < 8; k++) {
      if (Math.random() < lit) {
        ctx.globalAlpha = rand(0.35, 1);
        ctx.fillStyle = pick(cols);
        ctx.fillRect(k * 16 + 3, r * 16 + 4, 10, 8);
      }
    }
  }
  const t = colorTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function signTexture(txt: string, sub: string): THREE.CanvasTexture {
  const { canvas, ctx } = createCanvas(256, 128);
  ctx.fillStyle = '#0d5a3a';
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = '#e8f2ec';
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, 244, 116);
  ctx.fillStyle = '#f2f7f4';
  ctx.font = '600 34px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(txt, 128, 58);
  ctx.font = '500 24px Inter, sans-serif';
  ctx.fillText(sub, 128, 98);
  return colorTexture(canvas);
}
