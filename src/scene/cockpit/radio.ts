import * as THREE from 'three';
import { colorTexture, createCanvas } from '../../lib/canvas';
import type { StyleId } from '../../music/styles';
import { BOX, mesh } from '../geometry';
import type { Framing } from '../stage';

const W = 512, H = 224;
/** The face, in metres. */
const FACE_W = 0.29, FACE_H = FACE_W * (H / W);
const GAP = 0.008, RIM = 0.016;
/**
 * The timer display: under the face and as wide, or beside it on a phone and as
 * tall, where width is short. The group's origin is the middle of the whole unit.
 */
const STACKED = { display: { w: FACE_W, h: FACE_W / 4 } };
const SIDE = { display: { w: FACE_H * 2, h: FACE_H } };

/** Each style is a station on the dial, in this order, with the name printed above it. */
export const STATIONS: readonly StyleId[] = ['chillhop', 'jazzy', 'ambient', 'synthwave', 'rainycafe', 'rock80s'];
const STATION_LABELS: Record<StyleId, string> = { chillhop: 'CHILL', jazzy: 'JAZZ', ambient: 'AMBIENT', synthwave: 'SYNTH', rainycafe: 'CAFÉ', rock80s: 'ROCK' };

/** The dial runs 88 to 108 MHz; stations sit evenly inside it. */
const DIAL = { x0: 40, x1: 472, y: 80 };
const stationX = (dial: number): number => DIAL.x0 + 30 + (dial / (STATIONS.length - 1)) * (DIAL.x1 - DIAL.x0 - 60);
const VOLUME = { x0: 150, x1: 490, y: 126 };
const BUTTON_Y = 156, BUTTON_H = 52;
const PRESETS = STATIONS.map((_, i) => ({ x: 16 + i * 58, w: 52 }));
const SEEK = { x: 372, w: 60 }, POWER = { x: 438, w: 58 };

const AMBER = 'rgba(255,190,120,.95)', AMBER_DIM = 'rgba(255,175,95,.5)', AMBER_FAINT = 'rgba(255,165,80,.3)';

export interface RadioState {
  /** Where the tuning needle is, in stations: eases between whole numbers on a change. */
  dial: number;
  station: number;
  volume: number;
  /** Switched on, so music plays once it can. */
  on: boolean;
}

export type RadioHit = { kind: 'volume'; level: number } | { kind: 'station'; index: number } | { kind: 'seek' } | { kind: 'power' };

/** How close to the volume scale, in canvas pixels, a press still takes hold of it. */
const VOLUME_GRAB = 18;

/**
 * The car radio, styled like the gauges: a tuning dial with a station for each
 * music style, the radio's volume, six preset buttons, seek and power. The
 * timer's display sits in the same unit, just below.
 */
export class CarRadio {
  readonly group = new THREE.Group();
  readonly face: THREE.Mesh;
  /** Where the timer display is mounted: a unit square, scaled to the display's size. */
  readonly display = new THREE.Group();
  /** Whether the display sits beside the face, in its squarer shape. */
  compact = false;
  private readonly housing: THREE.Mesh;
  /** The housing's outline, local to `group`, so rain on the glass leaves it clear; kept up to date as it's rearranged. */
  readonly outline = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private drawn = '';

  constructor(parent: THREE.Object3D, housing: THREE.Material) {
    const { canvas, ctx } = createCanvas(W, H);
    this.ctx = ctx;
    this.texture = colorTexture(canvas);
    parent.add(this.group);
    this.housing = mesh(BOX, housing, 0, 0, -0.016, 1, 1, 0.03, this.group);
    // Like the other screens, its colour is scaled by the ignition, so it starts dark.
    this.face = mesh(new THREE.PlaneGeometry(FACE_W, FACE_H), new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false, color: 0x000000 }), 0, 0, 0, 1, 1, 1, this.group);
    this.group.add(this.display);
    this.arrange(false);
  }

  /** Follows the framing: on the left of the dash, or above the gauges in portrait with the timer beside it. */
  place(framing: Framing): void {
    this.group.position.set(framing.radioX, framing.radioY, framing.radioZ);
    this.group.rotation.x = framing.radioTilt;
    this.group.scale.setScalar(framing.radioScale);
    const compact = framing.radioSide > 0.5;
    if (compact !== this.compact) this.arrange(compact);
  }

  /** The whole unit's size, face and display together. */
  private get size(): { w: number; h: number } {
    const d = (this.compact ? SIDE : STACKED).display;
    return this.compact ? { w: FACE_W + GAP + d.w, h: FACE_H } : { w: FACE_W, h: FACE_H + GAP + d.h };
  }

  private arrange(compact: boolean): void {
    this.compact = compact;
    const d = (compact ? SIDE : STACKED).display, { w, h } = this.size;
    if (compact) {
      this.face.position.set(-w / 2 + FACE_W / 2, 0, 0);
      this.display.position.set(w / 2 - d.w / 2, 0, 0);
    } else {
      this.face.position.set(0, h / 2 - FACE_H / 2, 0);
      this.display.position.set(0, -h / 2 + d.h / 2, 0);
    }
    this.display.scale.set(d.w, d.h, 1);
    this.housing.scale.set(w + RIM, h + RIM, 0.03);
    const ow = w / 2 + RIM / 2, oh = h / 2 + RIM / 2;
    [[-ow, -oh], [ow, -oh], [ow, oh], [-ow, oh]].forEach(([x, y], i) => this.outline[i].set(x, y, 0));
  }

  /** A point on the face, local to `face`, from canvas pixels. */
  canvasToLocal(x: number, y: number): THREE.Vector3 {
    return new THREE.Vector3((x / W - 0.5) * FACE_W, (0.5 - y / H) * FACE_H, 0);
  }

  /** Canvas pixels from a point local to `face`, which may lie off the face while dragging. */
  localToCanvas(p: THREE.Vector3): { x: number; y: number } {
    return { x: (p.x / FACE_W + 0.5) * W, y: (0.5 - p.y / FACE_H) * H };
  }

  /** Canvas centres of the controls, for the browser tests. */
  get layout() {
    const centre = (b: { x: number; w: number }) => ({ x: b.x + b.w / 2, y: BUTTON_Y + BUTTON_H / 2 });
    return { presets: PRESETS.map(centre), seek: centre(SEEK), power: centre(POWER), volume: VOLUME, stations: STATIONS.map((_, i) => ({ x: stationX(i), y: DIAL.y - 20 })) };
  }

  /** What a press at a canvas point lands on; `dragging` keeps hold of the volume past its ends. */
  hit(x: number, y: number, dragging = false): RadioHit | null {
    const level = THREE.MathUtils.clamp((x - VOLUME.x0) / (VOLUME.x1 - VOLUME.x0), 0, 1);
    if (dragging) return { kind: 'volume', level };
    if (Math.abs(y - VOLUME.y) < VOLUME_GRAB && x > VOLUME.x0 - 12 && x < VOLUME.x1 + 12) return { kind: 'volume', level };
    const inside = (b: { x: number; w: number }) => x >= b.x && x <= b.x + b.w && y >= BUTTON_Y && y <= BUTTON_Y + BUTTON_H;
    const preset = PRESETS.findIndex(inside);
    if (preset >= 0) return { kind: 'station', index: preset };
    if (inside(SEEK)) return { kind: 'seek' };
    if (inside(POWER)) return { kind: 'power' };
    // Tapping the dial tunes to the nearest station.
    if (y > 20 && y < DIAL.y + 14 && x > DIAL.x0 && x < DIAL.x1) {
      let nearest = 0;
      STATIONS.forEach((_, i) => {
        if (Math.abs(stationX(i) - x) < Math.abs(stationX(nearest) - x)) nearest = i;
      });
      return { kind: 'station', index: nearest };
    }
    return null;
  }

  /** Draws again on the next update, e.g. once the web fonts have loaded. */
  invalidate(): void {
    this.drawn = '';
  }

  /** Redraws only when something it shows has visibly changed. */
  draw(state: RadioState): void {
    const key = [Math.round(state.dial * 100), state.station, Math.round(state.volume * 400), state.on].join('|');
    if (key === this.drawn) return;
    this.drawn = key;
    const g = this.ctx;
    g.fillStyle = '#040405';
    g.fillRect(0, 0, W, H);
    g.textAlign = 'center';
    g.textBaseline = 'middle';

    this.drawDial(g, state);
    this.drawVolume(g, state.volume);
    this.drawButtons(g, state);
    this.texture.needsUpdate = true;
  }

  private drawDial(g: CanvasRenderingContext2D, state: RadioState): void {
    g.font = '600 12px Inter, sans-serif';
    g.textAlign = 'left';
    g.fillStyle = AMBER_DIM;
    g.fillText('DRIVEY FM', 16, 14);
    g.textAlign = 'right';
    g.fillStyle = state.on ? '#ff8c32' : AMBER_FAINT;
    g.fillText(state.on ? '● STEREO' : 'STEREO', W - 16, 14);
    g.textAlign = 'center';

    g.strokeStyle = AMBER_FAINT;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(DIAL.x0, DIAL.y);
    g.lineTo(DIAL.x1, DIAL.y);
    g.stroke();
    for (let mhz = 88; mhz <= 108; mhz++) {
      const x = DIAL.x0 + ((mhz - 88) / 20) * (DIAL.x1 - DIAL.x0), major = mhz % 4 === 0;
      g.strokeStyle = major ? AMBER : AMBER_DIM;
      g.lineWidth = major ? 2 : 1;
      g.beginPath();
      g.moveTo(x, DIAL.y);
      g.lineTo(x, DIAL.y - (major ? 10 : 5));
      g.stroke();
      if (major) {
        g.fillStyle = AMBER_DIM;
        g.font = '11px Inter, sans-serif';
        g.fillText(String(mhz), x, DIAL.y + 11);
      }
    }
    STATIONS.forEach((id, i) => {
      g.fillStyle = i === state.station && state.on ? AMBER : AMBER_DIM;
      g.font = `${i === state.station ? 600 : 400} 13px Inter, sans-serif`;
      g.fillText(STATION_LABELS[id], stationX(i), DIAL.y - 26);
    });
    if (!state.on) return;
    const x = stationX(state.dial);
    g.save();
    g.shadowColor = '#ff7a1a';
    g.shadowBlur = 12;
    g.strokeStyle = '#ff8c32';
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x, DIAL.y - 42);
    g.lineTo(x, DIAL.y + 4);
    g.stroke();
    g.restore();
  }

  private drawVolume(g: CanvasRenderingContext2D, level: number): void {
    const { x0, x1, y } = VOLUME;
    g.textAlign = 'left';
    g.font = '600 12px Inter, sans-serif';
    g.fillStyle = AMBER_DIM;
    g.fillText('RADIO VOLUME', 16, y);
    g.textAlign = 'center';
    g.strokeStyle = AMBER_FAINT;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x0, y);
    g.lineTo(x1, y);
    g.stroke();
    for (let i = 0; i <= 10; i++) {
      const x = x0 + ((x1 - x0) * i) / 10, major = i % 5 === 0;
      g.strokeStyle = major ? AMBER : AMBER_DIM;
      g.lineWidth = major ? 2 : 1;
      g.beginPath();
      g.moveTo(x, y - 2);
      g.lineTo(x, y - (major ? 10 : 6));
      g.stroke();
    }
    const x = x0 + (x1 - x0) * level;
    g.save();
    g.shadowColor = '#ff7a1a';
    g.shadowBlur = 10;
    g.strokeStyle = '#ff8c32';
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x, y - 14);
    g.lineTo(x, y + 8);
    g.stroke();
    g.restore();
    g.fillStyle = '#1a1a1c';
    g.beginPath();
    g.arc(x, y + 9, 6, 0, Math.PI * 2);
    g.fill();
  }

  private drawButtons(g: CanvasRenderingContext2D, state: RadioState): void {
    const button = (b: { x: number; w: number }, label: string, lit: boolean, small = false) => {
      g.fillStyle = lit ? 'rgba(255,140,50,.28)' : '#121214';
      g.strokeStyle = lit ? '#ff8c32' : 'rgba(255,175,95,.28)';
      g.lineWidth = 2;
      g.beginPath();
      g.roundRect(b.x, BUTTON_Y, b.w, BUTTON_H, 6);
      g.fill();
      g.stroke();
      g.fillStyle = lit ? '#ffd2a0' : AMBER_DIM;
      g.font = `600 ${small ? 12 : 20}px Inter, sans-serif`;
      g.fillText(label, b.x + b.w / 2, BUTTON_Y + BUTTON_H / 2 + 1);
    };
    PRESETS.forEach((b, i) => button(b, String(i + 1), state.on && i === state.station));
    button(SEEK, 'SEEK ▸▸', false, true);
    button(POWER, 'PWR', state.on, true);
  }
}
