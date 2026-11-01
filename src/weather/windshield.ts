import * as THREE from 'three';
import { createCanvas } from '../lib/canvas';
import { clamp, damp, lerp, rand } from '../lib/math';
import type { LampTint } from '../routes/types';
import type { GlassOccluder } from '../scene/cockpit/cockpit';
import type { Weather } from './tables';

export interface WindshieldFrame {
  dt: number;
  speed: number;
  weather: Weather;
  /** Blended 0 to 1 streetlight level. */
  lamp: number;
}

/** The glass layer. Canvas today; a shader version would only need to implement this. */
export interface Windshield {
  update(frame: WindshieldFrame): void;
}

interface Drop {
  x: number;
  y: number;
  r: number;
  sprite: HTMLCanvasElement;
  alpha: number;
  flake: boolean;
}

const MAX_DROPS = 420;
const WIPER_PARKED = 3.02;
const WIPER_FAR = 0.55;
/** How fast drops dry off once it has stopped raining. */
const DRY_RATE = 0.15;
const FLAKE_MELT_RATE = 0.06;
const VEIL_RATE = 1.1;
const GLASS_LOWER_EDGE = [-1.2, -0.35, 0.6];

function dropSprite(tint: string): HTMLCanvasElement {
  const { canvas, ctx: g } = createCanvas(48, 48);
  const r = 22;
  const gr = g.createRadialGradient(24, 30, 2, 24, 24, r);
  gr.addColorStop(0, `rgba(${tint},.16)`);
  gr.addColorStop(0.7, `rgba(${tint},.06)`);
  gr.addColorStop(0.9, 'rgba(255,255,255,.3)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(24, 24, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(0,0,0,.22)';
  g.beginPath();
  g.arc(24, 27, 17, 0.15 * Math.PI, 0.85 * Math.PI);
  g.arc(24, 22, 17, 0.85 * Math.PI, 0.15 * Math.PI, true);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,.55)';
  g.beginPath();
  g.arc(17, 16, 3.5, 0, Math.PI * 2);
  g.fill();
  return canvas;
}

function flakeSprite(): HTMLCanvasElement {
  const { canvas, ctx: g } = createCanvas(32, 32);
  const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, 'rgba(255,255,255,.9)');
  r.addColorStop(0.5, 'rgba(240,245,255,.5)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 32, 32);
  return canvas;
}

class CanvasWindshield implements Windshield {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly sprites = {
    plain: dropSprite('205,218,238'),
    sodium: dropSprite('255,180,107'),
    teal: dropSprite('127,230,207'),
    red: dropSprite('255,90,70')
  };
  private readonly flake = flakeSprite();
  private readonly point = new THREE.Vector3();
  private width = 0;
  private height = 0;
  private top = 0;
  private bottom = 0;
  private drops: Drop[] = [];
  private dropBudget = 0;
  private veil = 0;
  private wiperPhase = 0;
  private wiperWait = 0;
  private wiperAngle = WIPER_PARKED;
  private wiperPeriod = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: THREE.Camera,
    private readonly roof: THREE.Object3D,
    private readonly occluders: readonly GlassOccluder[],
    private readonly lampTint: LampTint
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not available');
    this.ctx = ctx;
  }

  update({ dt, speed, weather, lamp }: WindshieldFrame): void {
    this.syncSize();
    this.measureGlass();
    this.spawn(dt, weather, lamp);
    this.age(dt, speed, weather);
    this.moveWipers(dt, weather);
    this.veil = lerp(this.veil, weather.veil, damp(VEIL_RATE, dt));
    this.draw();
  }

  private syncSize(): void {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (w === this.width && h === this.height) return;
    const dpr = Math.min(devicePixelRatio, 2);
    this.width = w;
    this.height = h;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private project(x: number, y: number, z: number, object: THREE.Object3D): { x: number; y: number } {
    this.point.set(x, y, z);
    object.localToWorld(this.point).project(this.camera);
    return { x: (this.point.x * 0.5 + 0.5) * this.width, y: (1 - (this.point.y * 0.5 + 0.5)) * this.height };
  }

  /** The glass spans from the roof edge to the dashboard, which both move as the camera sways and reframes. */
  private measureGlass(): void {
    this.camera.updateMatrixWorld(true);
    const H = this.height, parent = this.roof.parent as THREE.Object3D;
    let lowest = H;
    for (const x of GLASS_LOWER_EDGE) lowest = Math.min(lowest, this.project(x, -0.455, -1.36, parent).y);
    this.bottom = clamp(lowest - 6, H * 0.4, H);
    this.top = clamp(this.project(-0.35, this.roof.position.y + 0.485, -1.09, parent).y, 0, H * 0.3);
    this.drops = this.drops.filter(d => d.y < this.bottom - d.r * 0.5);
  }

  private spawn(dt: number, w: Weather, lamp: number): void {
    const area = (this.width * this.bottom) / (1200 * 700);
    this.dropBudget += (w.rain * 70 + w.snow * 14) * area * dt;
    const isSnow = w.snow > 0, narrow = this.width > 700 ? 1 : 0.8;
    while (this.dropBudget > 1) {
      this.dropBudget--;
      this.drops.push({
        x: rand(0, this.width),
        y: rand(this.top, this.bottom),
        r: isSnow ? rand(2, 5) : rand(1.4, 4.6) * narrow,
        sprite: isSnow ? this.flake : this.dropTint(lamp),
        alpha: 1,
        flake: isSnow
      });
    }
    if (this.drops.length > MAX_DROPS) this.drops.splice(0, this.drops.length - MAX_DROPS);
  }

  /** Under streetlights, some drops pick up the colour of the lamps and tail lights. */
  private dropTint(lamp: number): HTMLCanvasElement {
    if (lamp <= 0.5) return this.sprites.plain;
    const roll = Math.random();
    if (roll < 0.12) return this.sprites[this.lampTint];
    if (roll < 0.18) return this.sprites.red;
    if (roll < 0.3) return this.sprites.sodium;
    return this.sprites.plain;
  }

  private age(dt: number, speed: number, w: Weather): void {
    const airflow = speed / 22, drying = w.rain === 0 && w.snow === 0;
    for (const d of this.drops) {
      // Big drops get pushed up the glass by the wind.
      if (!d.flake && d.r > 3.4) d.y -= airflow * d.r * 3 * dt;
      if (d.flake) d.alpha -= dt * FLAKE_MELT_RATE;
      if (drying) d.alpha -= dt * DRY_RATE;
    }
    this.drops = this.drops.filter(d => d.y > this.top - 6 && d.alpha > 0);
  }

  private get wiperPivots(): [number, number][] {
    const y = this.bottom + this.height * 0.03;
    return [[this.width * 0.2, y], [this.width * 0.6, y]];
  }

  private get wiperLength(): number {
    return Math.min(this.width * 0.45, this.bottom * 1.02);
  }

  private moveWipers(dt: number, w: Weather): void {
    // When the weather clears, a blade mid-sweep finishes its stroke instead of snapping home.
    if (w.wipe > 0) this.wiperPeriod = w.wipe;
    else if (this.wiperPhase === 0) this.wiperPeriod = 0;
    if (this.wiperPeriod === 0) return;

    if (this.wiperWait > 0) {
      this.wiperWait -= dt;
    } else {
      this.wiperPhase += dt / this.wiperPeriod;
      if (this.wiperPhase >= 1) {
        this.wiperPhase = 0;
        this.wiperWait = w.wipePause;
      }
    }
    const angle = WIPER_PARKED + (WIPER_FAR - WIPER_PARKED) * (0.5 - 0.5 * Math.cos(Math.PI * 2 * this.wiperPhase));
    this.clearSwept(Math.min(angle, this.wiperAngle), Math.max(angle, this.wiperAngle));
    this.wiperAngle = angle;
  }

  private clearSwept(lo: number, hi: number): void {
    if (hi - lo < 1e-4) return;
    const L = this.wiperLength, pivots = this.wiperPivots;
    this.drops = this.drops.filter(d => {
      for (const [px, py] of pivots) {
        const dx = d.x - px, dy = py - d.y, dist = Math.hypot(dx, dy);
        if (dist < L && dist > L * 0.1) {
          const phi = Math.atan2(dy, dx);
          if (phi >= lo - 0.02 && phi <= hi + 0.02) return false;
        }
      }
      return true;
    });
  }

  private draw(): void {
    const g = this.ctx;
    g.clearRect(0, 0, this.width, this.height);
    g.save();
    this.clipToGlass();
    if (this.veil > 0.001) {
      g.fillStyle = `rgba(190,200,212,${this.veil})`;
      g.fillRect(0, 0, this.width, this.bottom);
    }
    for (const d of this.drops) {
      g.globalAlpha = d.alpha;
      g.drawImage(d.sprite, d.x - d.r, d.y - d.r, d.r * 2, d.r * 2);
    }
    g.globalAlpha = 1;
    if (this.wiperAngle !== WIPER_PARKED || this.wiperPeriod > 0) this.drawWipers();
    g.restore();
  }

  /** Between roof and dash, minus whatever sits inside the car in front of the glass. */
  private clipToGlass(): void {
    const g = this.ctx;
    g.beginPath();
    g.rect(0, this.top, this.width, this.bottom - this.top);
    for (const { object, points } of this.occluders) {
      points.forEach((p, i) => {
        const s = this.project(p.x, p.y, p.z, object);
        if (i === 0) g.moveTo(s.x, s.y);
        else g.lineTo(s.x, s.y);
      });
      g.closePath();
    }
    g.clip('evenodd');
  }

  private drawWipers(): void {
    const g = this.ctx, th = this.wiperAngle, L = this.wiperLength, W = this.width;
    const cos = Math.cos(th), sin = Math.sin(th);
    for (const [px, py] of this.wiperPivots) {
      g.strokeStyle = '#060607';
      g.lineCap = 'round';
      g.lineWidth = Math.max(4, W * 0.005);
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(px + cos * L * 0.9, py - sin * L * 0.9);
      g.stroke();
      g.lineWidth = Math.max(2.5, W * 0.003);
      const ox = Math.cos(th + Math.PI / 2) * 4, oy = -Math.sin(th + Math.PI / 2) * 4;
      g.beginPath();
      g.moveTo(px + cos * L * 0.15 + ox, py - sin * L * 0.15 + oy);
      g.lineTo(px + cos * L + ox, py - sin * L + oy);
      g.stroke();
    }
  }
}

export function createWindshield(
  canvas: HTMLCanvasElement,
  camera: THREE.Camera,
  roof: THREE.Object3D,
  occluders: readonly GlassOccluder[],
  lampTint: LampTint
): Windshield {
  return new CanvasWindshield(canvas, camera, roof, occluders, lampTint);
}
