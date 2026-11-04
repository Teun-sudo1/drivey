import * as THREE from 'three';
import { rand } from './math';

export function createCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available');
  return { canvas, ctx };
}

export function colorTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Fog on glass, as it really forms: soft, overlapping patches of a pale colour, thicker in some places than others. */
export function fogPatches(w: number, h: number, colour = '215,222,232'): HTMLCanvasElement {
  const { canvas, ctx: g } = createCanvas(w, h);
  for (let i = 0; i < 70; i++) {
    const x = rand(0, w), y = rand(0, h), r = rand(0.08, 0.3) * Math.max(w, h);
    const patch = g.createRadialGradient(x, y, 0, x, y, r);
    patch.addColorStop(0, `rgba(${colour},${rand(0.25, 0.6)})`);
    patch.addColorStop(1, `rgba(${colour},0)`);
    g.fillStyle = patch;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return canvas;
}

/** Raindrops scattered over side glass, each a faint bead with a bright edge, on a tile that repeats. */
export function sideDrops(size: number): HTMLCanvasElement {
  const { canvas, ctx: g } = createCanvas(size, size);
  for (let i = 0; i < 140; i++) {
    const x = rand(0, size), y = rand(0, size), r = rand(0.8, 3.2);
    g.fillStyle = 'rgba(205,218,238,.12)';
    g.beginPath();
    g.ellipse(x, y, r * 1.4, r, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,.28)';
    g.fillRect(x - r * 0.4, y - r * 0.4, 1, 1);
  }
  return canvas;
}
