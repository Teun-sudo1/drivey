import * as THREE from 'three';
import { createCanvas } from '../lib/canvas';
import { damp, lerp, rand } from '../lib/math';
import type { LampTint } from '../routes/types';
import type { Weather } from './tables';

export interface WindshieldFrame {
  dt: number;
  speed: number;
  weather: Weather;
  /** Blended 0 to 1 streetlight level. */
  lamp: number;
  /** Wipers only run with the ignition on. */
  wipersOn: boolean;
  /** 0 in the open to 1 in a tunnel, where nothing new lands on the glass. */
  shelter: number;
}

/** The glass layer, painted on a canvas that textures the windshield panel in the car. */
export interface Windshield {
  /** The glass, as drawn, for the windshield panel to show. */
  readonly texture: THREE.Texture;
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
/** Parked flat along the bottom of the glass, tips towards the passenger, and sweeping up through 45 degrees. */
const WIPER_PARKED = 3.02;
const WIPER_FAR = WIPER_PARKED - Math.PI / 4;
/**
 * A tandem pair, as on most cars, across the glass for the right-hand-drive car as built (the panel mirrors with the car):
 * both sweep the same way, the driver's pivoting by the driver's pillar with the longer blade, the passenger's from the middle.
 */
const WIPERS = [
  { x: 0.8, length: 0.85 },
  { x: -0.12, length: 0.78 }
];
/** How far below the glass the pivots sit, in pixels, on the scuttle. */
const WIPER_PIVOT_DROP = 8;
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
/** The glass texture's size, in pixels: about as wide for its height as the windshield. */
export const GLASS_W = 1200, GLASS_H = 540;
/** The glass panel's bottom edge, left to right in the cockpit's space, which the texture spans. */
export const GLASS_X0 = -1.42, GLASS_X1 = 0.9;
/** How many beads of condensation the steamed-up glass shows. */
const CONDENSATION_BEADS = 6000;
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

/** Tiny beads of condensation across the whole glass, drawn once. */
function condensation(): HTMLCanvasElement {
  const { canvas, ctx: g } = createCanvas(GLASS_W, GLASS_H);
  for (let i = 0; i < CONDENSATION_BEADS; i++) {
    g.fillStyle = `rgba(225,232,242,${rand(0.05, 0.2)})`;
    g.beginPath();
    g.arc(rand(0, GLASS_W), rand(0, GLASS_H), rand(0.5, 1.8), 0, Math.PI * 2);
    g.fill();
  }
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
  private readonly beads = condensation();
  /** How dark it is outside, from the streetlight level, so the steamed-up glass isn't bright at night. */
  private dark = 0;
  readonly texture: THREE.CanvasTexture;
  private readonly width = GLASS_W;
  private readonly height = GLASS_H;
  private readonly top = 0;
  readonly bottom = GLASS_H;
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
  private readonly strokeListeners: (() => void)[] = [];
  /** Whether the last frame had only the parked wipers on the glass, so a still, dry glass isn't redrawn every frame. */
  private still = false;

  constructor(
    canvas: HTMLCanvasElement,
    private lampTint: LampTint
  ) {
    canvas.width = GLASS_W;
    canvas.height = GLASS_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not available');
    this.ctx = ctx;
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
  }

  onStroke(listener: () => void): void {
    this.strokeListeners.push(listener);
  }

  setLampTint(tint: LampTint): void {
    this.lampTint = tint;
  }

  update({ dt, speed, weather, lamp, wipersOn, shelter }: WindshieldFrame): void {
    this.dark = lamp;
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

  /** Each wiper's pivot on the glass and its blade's length there, in pixels. */
  private get wiperPivots(): [number, number, number][] {
    const perMetre = this.width / (GLASS_X1 - GLASS_X0);
    return WIPERS.map(({ x, length }) => [(x - GLASS_X0) * perMetre, this.height + WIPER_PIVOT_DROP, length * perMetre]);
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
    // Up and back as two strokes, each easing out of rest, fastest mid-sweep, and easing into the turn, like a crank-driven linkage.
    const stroke = this.wiperPhase < 0.5 ? this.wiperPhase * 2 : (1 - this.wiperPhase) * 2;
    const eased = stroke * stroke * stroke * (stroke * (stroke * 6 - 15) + 10);
    const angle = WIPER_PARKED + (WIPER_FAR - WIPER_PARKED) * eased;
    this.clearSwept(Math.min(angle, this.wiperAngle), Math.max(angle, this.wiperAngle));
    this.wiperMotion = angle - this.wiperAngle;
    this.wetGlass = w.rain > 0;
    this.wiperAngle = angle;
  }

  private clearSwept(lo: number, hi: number): void {
    if (hi - lo < 1e-4) return;
    const pivots = this.wiperPivots;
    this.drops = this.drops.filter(d => {
      for (const [px, py, L] of pivots) {
        const dx = d.x - px, dy = py - d.y, dist = Math.hypot(dx, dy);
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
    if (empty && this.still) return;
    this.still = empty;
    const g = this.ctx;
    g.clearRect(0, 0, this.width, this.height);
    // Outside the glass, so under everything on it: the film, mist and drops all lie between the eye and the blades.
    this.drawWipers();
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
    this.drawSmear();
    this.texture.needsUpdate = true;
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
  /** Condensation: a milky film, lit like the night or day outside and opaque, so nothing of the drive shows until the driver settles in, beaded with tiny droplets. */
  private drawMist(): void {
    const g = this.ctx, fade = g.createLinearGradient(0, this.top, 0, this.bottom);
    const shade = (day: number, night: number): number => Math.round(lerp(day, night, this.dark));
    const tone = (day: number[], night: number[], alpha: number) => `rgba(${day.map((d, i) => shade(d, night[i])).join()},${alpha * this.mist})`;
    fade.addColorStop(0, tone([150, 158, 170], [38, 42, 52], 1));
    fade.addColorStop(1, tone([120, 128, 140], [30, 33, 41], 1));
    g.fillStyle = fade;
    g.fillRect(0, this.top, this.width, this.bottom - this.top);
    g.globalAlpha = this.mist * lerp(0.9, 0.5, this.dark);
    g.drawImage(this.beads, 0, 0);
    g.globalAlpha = 1;
  }

  /** The film of water a blade leaves behind as it sweeps. */
  private drawSmear(): void {
    if (!this.wetGlass || this.wiperMotion === 0) return;
    const g = this.ctx, th = this.wiperAngle;
    const from = -th, to = -(th - Math.sign(this.wiperMotion) * SMEAR_ANGLE);
    g.strokeStyle = 'rgba(205,218,238,.09)';
    g.lineWidth = 1.5;
    for (const [px, py, L] of this.wiperPivots) {
      for (const r of SMEAR_RADII) {
        g.beginPath();
        g.arc(px, py, r * L, Math.min(from, to), Math.max(from, to));
        g.stroke();
      }
    }
  }

  private drawWipers(): void {
    const g = this.ctx, th = this.wiperAngle;
    const cos = Math.cos(th), sin = Math.sin(th);
    for (const [px, py, L] of this.wiperPivots) {
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

export function createWindshield(canvas: HTMLCanvasElement, lampTint: LampTint): Windshield {
  return new CanvasWindshield(canvas, lampTint);
}
