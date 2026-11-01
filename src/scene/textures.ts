import * as THREE from 'three';
import { colorTexture, createCanvas } from '../lib/canvas';
import { pick, rand } from '../lib/math';

export const GLOW = (() => {
  const { canvas, ctx } = createCanvas(128, 128);
  const r = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.18, 'rgba(255,255,255,.55)');
  r.addColorStop(0.5, 'rgba(255,255,255,.12)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = r;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
})();

export const STREAK = (() => {
  const { canvas, ctx } = createCanvas(32, 256);
  const v = ctx.createLinearGradient(0, 0, 0, 256);
  v.addColorStop(0, 'rgba(255,255,255,0)');
  v.addColorStop(0.25, 'rgba(255,255,255,.9)');
  v.addColorStop(0.6, 'rgba(255,255,255,.45)');
  v.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, 32, 256);
  ctx.globalCompositeOperation = 'destination-in';
  const h = ctx.createLinearGradient(0, 0, 32, 0);
  h.addColorStop(0, 'rgba(0,0,0,0)');
  h.addColorStop(0.5, 'rgba(0,0,0,1)');
  h.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = h;
  ctx.fillRect(0, 0, 32, 256);
  return new THREE.CanvasTexture(canvas);
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
