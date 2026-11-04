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
  /** Wipers only run with the ignition on. */
  wipersOn: boolean;
  /** Mirrors the wipers for a left-hand-drive car. */
  mirrored: boolean;
  /** 0 in the open to 1 in a tunnel, where nothing new lands on the glass. */
  shelter: number;
}

/** The glass layer. Canvas today; a shader version would only need to implement this. */
export interface Windshield {
  update(frame: WindshieldFrame): void;
  /** Called as a blade sets off across the glass, and again as it turns back. */
  onStroke(listener: () => void): void;
  /** Paints the glass as it now is; separate from update so a frame is drawn once, however many steps it took. */
  draw(): void;
  /** The streetlight colour drops pick up, which differs by route. */
  setLampTint(tint: LampTint): void;
  /** With the A/C on, the glass clears of fog, as it does in a real car. */
  airCon: boolean;

  /** Steams the glass up, or clears it as the demister would; instantly skips the easing. */
  setMisted(misted: boolean, instantly?: boolean): void;
}

interface Drop {
  x: number;
  y: number;
  r: number;
  sprite: HTMLCanvasElement;
  alpha: number;
  flake: boolean;
  /** Where a running drop started, so it can leave a trail of water behind it. */
  startY: number;
}

const MAX_DROPS = 420;
const WIPER_PARKED = 3.02;
const WIPER_FAR = 0.55;
/** Blade length as a share of the screen's width. */
const LANDSCAPE_WIPER_REACH = 0.45;
const PORTRAIT_WIPER_REACH = 0.98;
/** Stroke widths as a share of the blade's length. */
const WIPER_ARM_WIDTH = 0.011;
const WIPER_BLADE_WIDTH = 0.0067;
/** How fast drops dry off once it has stopped raining. */
const DRY_RATE = 0.15;
const FLAKE_MELT_RATE = 0.06;
const VEIL_RATE = 1.1;
/** How fogged the glass gets from the inside in wet weather without the A/C, and how slowly it gets there. */
const FOGGED_UP = 0.3;
const FOG_UP_RATE = 0.05;
/** How quickly the glass clears once a seat is picked. */
const DEMIST_RATE = 1.6;
const GLASS_LOWER_EDGE = [-1.4, -0.26, 0.9];
const RUNNING_DROP_RADIUS = 3.4;
const MAX_TRAIL = 110;
/** How far behind the blade its wet smear reaches, in radians. */
const SMEAR_ANGLE = 0.4;
const SMEAR_RADII = [0.34, 0.52, 0.7, 0.88];

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
  /** Steamed-up glass, which hides the view until the driver has picked a seat. */
  private mist = 0;
  private mistTarget = 0;
  /** The A/C, which keeps the glass from fogging over. */
  airCon = false;
  private wiperPhase = 0;
  private wiperWait = 0;
  private wiperAngle = WIPER_PARKED;
  private wiperPeriod = 0;
  private wiperMotion = 0;
  private wetGlass = false;
  private mirrored = false;
  private readonly strokeListeners: (() => void)[] = [];
  /** Whether the last frame drew nothing, so an empty glass isn't cleared over and over. */
  private blank = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: THREE.Camera,
    private readonly roof: THREE.Object3D,
    private readonly occluders: readonly GlassOccluder[],
    private readonly sideWindows: readonly GlassOccluder[],
    private readonly pillars: readonly GlassOccluder[],
    private lampTint: LampTint
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not available');
    this.ctx = ctx;
  }

  onStroke(listener: () => void): void {
    this.strokeListeners.push(listener);
  }

  setLampTint(tint: LampTint): void {
    this.lampTint = tint;
  }

  update({ dt, speed, weather, lamp, wipersOn, mirrored, shelter }: WindshieldFrame): void {
    this.mirrored = mirrored;
    this.syncSize();
    this.measureGlass();
    this.spawn(dt * (1 - shelter), weather, lamp);
    this.age(dt, speed, weather);
    this.moveWipers(dt, weather, wipersOn);
    // In rain or fog the glass slowly fogs over from the inside too, unless the A/C is on, which clears it.
    const inside = weather.rain > 0 || weather.veil > 0 ? FOGGED_UP : 0;
    const target = this.airCon ? 0 : weather.veil + inside;
    this.veil = lerp(this.veil, target, damp(target > this.veil ? FOG_UP_RATE : VEIL_RATE, dt));
    this.mist = Math.abs(this.mist - this.mistTarget) < 0.002 ? this.mistTarget : lerp(this.mist, this.mistTarget, damp(DEMIST_RATE, dt));
  }

  setMisted(misted: boolean, instantly = false): void {
    this.mistTarget = misted ? 1 : 0;
    if (instantly) this.mist = this.mistTarget;
  }

  private syncSize(): void {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (w === this.width && h === this.height) return;
    // Resizing wipes the canvas, so the next frame must paint even if the glass is empty.
    this.blank = false;
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
    for (const x of GLASS_LOWER_EDGE) lowest = Math.min(lowest, this.project(x, -0.47, -1.38, parent).y);
    this.bottom = clamp(lowest, H * 0.4, H);
    this.top = clamp(this.project(-0.35, this.roof.position.y + 0.485, -1.09, parent).y, 0, H * 0.3);
    this.drops = this.drops.filter(d => d.y < this.bottom - d.r * 0.5);
  }

  private spawn(dt: number, w: Weather, lamp: number): void {
    const area = (this.width * this.bottom) / (1200 * 700);
    this.dropBudget += (w.rain * 70 + w.snow * 14) * area * dt;
    const isSnow = w.snow > 0, narrow = this.width > 700 ? 1 : 0.8;
    while (this.dropBudget > 1) {
      this.dropBudget--;
      const y = rand(this.top, this.bottom);
      this.drops.push({
        x: rand(0, this.width),
        y,
        startY: y,
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
      if (!d.flake && d.r > RUNNING_DROP_RADIUS) d.y -= airflow * d.r * 3 * dt;
      if (d.flake) d.alpha -= dt * FLAKE_MELT_RATE;
      if (drying) d.alpha -= dt * DRY_RATE;
    }
    this.drops = this.drops.filter(d => d.y > this.top - 6 && d.alpha > 0);
  }

  private get wiperPivots(): [number, number][] {
    // Just below the glass, so parked blades rest on the scuttle in view, above the dash.
    const y = this.bottom + this.height * 0.008;
    // Far enough apart that the right one parks clear of the gauge hood, so both show.
    return [[this.width * 0.36, y], [this.width * 0.86, y]];
  }

  private get wiperLength(): number {
    // Tall glass needs blades long relative to its width, or they only clear the bottom of it.
    const widthShare = this.height > this.width ? PORTRAIT_WIPER_REACH : LANDSCAPE_WIPER_REACH;
    return Math.min(this.width * widthShare, this.bottom * 1.3);
  }

  private moveWipers(dt: number, w: Weather, wipersOn: boolean): void {
    // When the weather clears, a blade mid-sweep finishes its stroke instead of snapping home.
    if (wipersOn && w.wipe > 0) this.wiperPeriod = w.wipe;
    else if (this.wiperPhase === 0) this.wiperPeriod = 0;
    if (this.wiperPeriod === 0) {
      // Otherwise the film from the blade's last movement would keep being drawn on parked wipers.
      this.wiperMotion = 0;
      return;
    }

    if (this.wiperWait > 0) {
      this.wiperWait -= dt;
    } else {
      const before = this.wiperPhase;
      this.wiperPhase += dt / this.wiperPeriod;
      if (before === 0 || (before < 0.5 && this.wiperPhase >= 0.5)) for (const listener of this.strokeListeners) listener();
      if (this.wiperPhase >= 1) {
        this.wiperPhase = 0;
        this.wiperWait = w.wipePause;
      }
    }
    const angle = WIPER_PARKED + (WIPER_FAR - WIPER_PARKED) * (0.5 - 0.5 * Math.cos(Math.PI * 2 * this.wiperPhase));
    this.clearSwept(Math.min(angle, this.wiperAngle), Math.max(angle, this.wiperAngle));
    this.wiperMotion = angle - this.wiperAngle;
    this.wetGlass = w.rain > 0;
    this.wiperAngle = angle;
  }

  private clearSwept(lo: number, hi: number): void {
    if (hi - lo < 1e-4) return;
    const L = this.wiperLength, pivots = this.wiperPivots;
    this.drops = this.drops.filter(d => {
      for (const [px, py] of pivots) {
        const dx = (this.mirrored ? this.width - d.x : d.x) - px, dy = py - d.y, dist = Math.hypot(dx, dy);
        if (dist < L && dist > L * 0.1) {
          const phi = Math.atan2(dy, dx);
          if (phi >= lo - 0.02 && phi <= hi + 0.02) return false;
        }
      }
      return true;
    });
  }

  draw(): void {
    const empty = this.drops.length === 0 && this.veil <= 0.001 && this.mist === 0 && this.wiperAngle === WIPER_PARKED && this.wiperPeriod === 0;
    if (empty && this.blank) return;
    this.blank = empty;
    const g = this.ctx;
    g.clearRect(0, 0, this.width, this.height);
    g.save();
    this.clipToGlass();
    // Outside the glass, so under everything on it: the film, mist and drops all lie between the eye and the blades.
    g.save();
    if (this.mirrored) {
      g.translate(this.width, 0);
      g.scale(-1, 1);
    }
    this.drawWipers();
    g.restore();
    if (this.veil > 0.001) {
      g.fillStyle = `rgba(190,200,212,${this.veil})`;
      g.fillRect(0, 0, this.width, this.bottom);
    }
    if (this.mist > 0) this.drawMist();
    this.drawTrails();
    for (const d of this.drops) {
      g.globalAlpha = d.alpha;
      g.drawImage(d.sprite, d.x - d.r, d.y - d.r, d.r * 2, d.r * 2);
    }
    g.globalAlpha = 1;
    if (this.mirrored) {
      g.translate(this.width, 0);
      g.scale(-1, 1);
    }
    this.drawSmear();
    g.restore();
    if (this.mist > 0) this.mistSideWindows();
  }

  /** Rain stays off the side windows, but they steam up along with the windshield. */
  private mistSideWindows(): void {
    const g = this.ctx;
    g.save();
    // Not over the parts of the cabin in front of it, such as the nav screen; the pillars are where the side glass starts.
    for (const { object, points } of this.occluders) {
      if (this.pillars.some(p => p.points === points)) continue;
      g.beginPath();
      g.rect(0, 0, this.width, this.height);
      points.forEach((p, i) => {
        const s = this.project(p.x, p.y, p.z, object);
        if (i === 0) g.moveTo(s.x, s.y);
        else g.lineTo(s.x, s.y);
      });
      g.closePath();
      g.clip('evenodd');
    }
    g.fillStyle = `rgba(110,118,130,${this.mist})`;
    for (const { object, points } of this.sideWindows) {
      g.beginPath();
      points.forEach((p, i) => {
        const s = this.project(p.x, p.y, p.z, object);
        if (i === 0) g.moveTo(s.x, s.y);
        else g.lineTo(s.x, s.y);
      });
      g.closePath();
      g.fill();
    }
    g.restore();
  }

  /** Between roof and dash, minus whatever sits inside the car in front of the glass. */
  private clipToGlass(): void {
    const g = this.ctx;
    g.beginPath();
    g.rect(0, this.top, this.width, this.bottom - this.top);
    g.clip();
    // One clip per occluder: with a single even-odd path, any two that overlap, or one reaching past the
    // glass, would cancel out and let rain show through where they meet.
    for (const { object, points } of this.occluders) {
      g.beginPath();
      g.rect(0, 0, this.width, this.height);
      points.forEach((p, i) => {
        const s = this.project(p.x, p.y, p.z, object);
        if (i === 0) g.moveTo(s.x, s.y);
        else g.lineTo(s.x, s.y);
      });
      g.closePath();
      g.clip('evenodd');
    }
  }

  private drawTrails(): void {
    const g = this.ctx;
    g.strokeStyle = 'rgb(205,218,238)';
    g.lineCap = 'round';
    for (const d of this.drops) {
      const travelled = Math.min(d.startY - d.y, MAX_TRAIL);
      if (d.flake || travelled < 2) continue;
      // Two tapering segments: fresh water near the drop, thinning out behind it.
      g.globalAlpha = d.alpha * 0.13;
      g.lineWidth = d.r * 0.32;
      g.beginPath();
      g.moveTo(d.x, d.y);
      g.lineTo(d.x, d.y + travelled * 0.45);
      g.stroke();
      g.globalAlpha = d.alpha * 0.05;
      g.lineWidth = d.r * 0.18;
      g.beginPath();
      g.moveTo(d.x, d.y + travelled * 0.45);
      g.lineTo(d.x, d.y + travelled);
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  /** Condensation: thickest up top, thinning towards the vents at the bottom of the glass. */
  private drawMist(): void {
    const g = this.ctx, fade = g.createLinearGradient(0, this.top, 0, this.bottom);
    fade.addColorStop(0, `rgba(122,130,142,${this.mist})`);
    fade.addColorStop(1, `rgba(96,104,116,${this.mist})`);
    g.fillStyle = fade;
    g.fillRect(0, this.top, this.width, this.bottom - this.top);
  }

  /** The film of water a blade leaves behind as it sweeps. */
  private drawSmear(): void {
    if (!this.wetGlass || this.wiperMotion === 0) return;
    const g = this.ctx, L = this.wiperLength, th = this.wiperAngle;
    const from = -th, to = -(th - Math.sign(this.wiperMotion) * SMEAR_ANGLE);
    g.strokeStyle = 'rgba(205,218,238,.09)';
    g.lineWidth = 1.5;
    for (const [px, py] of this.wiperPivots) {
      for (const r of SMEAR_RADII) {
        g.beginPath();
        g.arc(px, py, r * L, Math.min(from, to), Math.max(from, to));
        g.stroke();
      }
    }
  }

  private drawWipers(): void {
    const g = this.ctx, th = this.wiperAngle, L = this.wiperLength;
    const cos = Math.cos(th), sin = Math.sin(th);
    for (const [px, py] of this.wiperPivots) {
      g.strokeStyle = '#060607';
      g.lineCap = 'round';
      g.lineWidth = Math.max(5, L * WIPER_ARM_WIDTH);
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(px + cos * L * 0.9, py - sin * L * 0.9);
      g.stroke();
      g.lineWidth = Math.max(3.5, L * WIPER_BLADE_WIDTH);
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
  sideWindows: readonly GlassOccluder[],
  pillars: readonly GlassOccluder[],
  lampTint: LampTint
): Windshield {
  return new CanvasWindshield(canvas, camera, roof, occluders, sideWindows, pillars, lampTint);
}
