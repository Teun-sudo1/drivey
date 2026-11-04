import * as THREE from 'three';
import { colorTexture, createCanvas } from '../lib/canvas';
import { damp, lerp } from '../lib/math';

/** Objects the driver sees but the road's reflection doesn't. */
export const INTERIOR_LAYER = 1;

/** How far ahead of the eye the rear-view mirror hangs. */
export const MIRROR_DISTANCE = 0.78;
export const MIRROR_OUTER_HEIGHT = 0.1;

const EYE_HEIGHT = 1.22;
const NEAR = 0.15; // far enough out to keep depth precision for the road decals
const REFRAME_RATE = 6;

const FRAMING_KEYS = ['fov', 'pitch', 'roofY', 'mirrorX', 'mirrorY', 'mirrorYaw', 'radioX', 'radioY', 'radioZ', 'radioTilt', 'radioScale', 'radioSide', 'gaugeScale', 'seatBack', 'lookDown', 'eyeDrop'] as const;

/** How the camera frames the car in each orientation. */
export interface Framing {
  fov: number;
  pitch: number;
  roofY: number;
  mirrorX: number;
  mirrorY: number;
  mirrorYaw: number;
  /** Where the radio sits, and how big it is: on the left of the dash, or above the gauges in portrait. */
  radioX: number;
  radioY: number;
  radioZ: number;
  radioTilt: number;
  radioScale: number;
  /** 1 puts the timer display beside the radio rather than under it, where the screen is narrow. */
  radioSide: number;
  /** Size of the gauges, smaller on a phone held upright. */
  gaugeScale: number;
  /** How far the eye sits back from the driver's seat, which brings the passenger seat and console into view. */
  seatBack: number;
  /** How far the eye looks down into the car, beyond the pitch; the interior stays put in the car while the view tilts. */
  lookDown: number;
  /** How far the eye sits below its usual height, as if the seat were lower. */
  eyeDrop: number;
}
/** How far the head turns when looking around. */
const LOOK_YAW = 1.3, LOOK_UP = 0.35, LOOK_DOWN = 0.6;
const LANDSCAPE: Framing = {
  fov: 72, pitch: -0.04, roofY: 0, mirrorX: -0.33, mirrorY: 0.29, mirrorYaw: 0.12,
  // On its own pod, on top of the timer display's housing.
  radioX: -0.435, radioY: -0.6, radioZ: -0.84, radioTilt: -0.35, radioScale: 1, radioSide: 0, gaugeScale: 1, seatBack: 0.2, lookDown: 0.24, eyeDrop: 0
};
/** Close to the wheel, as a phone on its side sits by default, so the radio stays big enough to read and tap. */
/** Upright, the eye sits this much lower and looks this much higher, so the road fills more of the tall screen. */
/** Upright the screen is narrow, so the view is wider than a sideways phone's close-up. */
const PORTRAIT_FOV = 70;
const PORTRAIT_EYE_DROP = 0.06, PORTRAIT_TILT_UP = 0.1;
const CLOSE: Framing = { ...LANDSCAPE, fov: 55, seatBack: 0, lookDown: 0 };
function blend(a: Framing, b: Framing, t: number): Framing {
  const out = { ...a };
  for (const key of FRAMING_KEYS) out[key] = lerp(a[key], b[key], t);
  return out;
}

export class Stage {
  private pov: number | null = null;
  private maxPixelRatio = 2;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(LANDSCAPE.fov, 1, NEAR, 800);
  readonly fog = new THREE.FogExp2(0x0c121c, 0.008);
  readonly framing: Framing = { ...LANDSCAPE };

  private readonly skyCtx: CanvasRenderingContext2D;
  private readonly skyTexture: THREE.CanvasTexture;
  private readonly resizeListeners = new Set<(w: number, h: number, pixelRatio: number) => void>();
  private settled = false;

  constructor(canvas: HTMLCanvasElement) {
    // Turning the head looks round first, then up or down, as a person does.
    this.camera.rotation.order = 'YXZ';
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene.fog = this.fog;
    this.camera.position.set(0, EYE_HEIGHT, 0);
    this.camera.layers.enable(INTERIOR_LAYER);
    this.scene.add(this.camera);

    const sky = createCanvas(2, 256);
    this.skyCtx = sky.ctx;
    this.skyTexture = colorTexture(sky.canvas);
    this.scene.background = this.skyTexture;

    addEventListener('resize', () => this.resize());
    Object.assign(this.framing, this.targetFraming());
    this.resize();
  }

  /** Where the driver is looking, dragged round from straight ahead: yaw left/right and pitch up/down, in radians. */
  readonly look = { yaw: 0, pitch: 0 };

  /** Turns the head by a drag, within what a seated driver can see. */
  lookBy(yaw: number, pitch: number): void {
    this.look.yaw = Math.min(LOOK_YAW, Math.max(-LOOK_YAW, this.look.yaw + yaw));
    this.look.pitch = Math.min(LOOK_UP, Math.max(-LOOK_DOWN, this.look.pitch + pitch));
  }

  get eyeHeight(): number {
    return EYE_HEIGHT;
  }

  drawSky(top: THREE.Color, bottom: THREE.Color): void {
    const g = this.skyCtx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#' + top.getHexString());
    g.addColorStop(1, '#' + bottom.getHexString());
    this.skyCtx.fillStyle = g;
    this.skyCtx.fillRect(0, 0, 2, 256);
    this.skyTexture.needsUpdate = true;
  }

  onResize(listener: (w: number, h: number, pixelRatio: number) => void): void {
    this.resizeListeners.add(listener);
    listener(innerWidth, innerHeight, this.renderer.getPixelRatio());
  }

  /** Caps the rendering resolution, for the quality setting. */
  setMaxPixelRatio(ratio: number): void {
    if (ratio === this.maxPixelRatio) return;
    this.maxPixelRatio = ratio;
    this.resize();
  }

  /** Eases towards the framing for the current orientation, so rotation doesn't jump. */
  updateFraming(dt: number, snap: boolean): void {
    if (this.settled) return;
    const target = this.targetFraming();
    const k = snap ? 1 : damp(REFRAME_RATE, dt);
    for (const key of FRAMING_KEYS) this.framing[key] = lerp(this.framing[key], target[key], k);
    if (FRAMING_KEYS.every(key => Math.abs(this.framing[key] - target[key]) < 0.002)) {
      Object.assign(this.framing, target);
      this.settled = true;
    }
    this.camera.fov = this.framing.fov;
    this.camera.updateProjectionMatrix();
  }

  /** Where the driver sits, 0 close to 1 sat back, or null for the screen's default; eases there, or jumps on startup. */
  setPov(pov: number | null, snap = false): void {
    if (pov === this.pov && !snap) return;
    this.pov = pov;
    this.settled = false;
    if (snap) Object.assign(this.framing, this.targetFraming());
  }

  /** How far back the driver sits: sat back, as on every screen, until chosen. */
  povFor(): number {
    return this.pov ?? 1;
  }

  /** The same cockpit on every screen; upright shows less of it, so the eye tilts up to keep the road in view. */
  private targetFraming(): Framing {
    const framing = blend(CLOSE, LANDSCAPE, this.povFor());
    if (innerHeight > innerWidth) {
      framing.fov = PORTRAIT_FOV;
      framing.lookDown -= PORTRAIT_TILT_UP;
      framing.eyeDrop = PORTRAIT_EYE_DROP;
    }
    return framing;
  }


  private resize(): void {
    const w = innerWidth, h = innerHeight;
    const pixelRatio = Math.min(devicePixelRatio, this.maxPixelRatio);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.settled = false;
    for (const listener of this.resizeListeners) listener(w, h, pixelRatio);
  }
}
