import * as THREE from 'three';
import { colorTexture, createCanvas } from '../lib/canvas';
import { damp, lerp } from '../lib/math';

/** Objects the driver sees but the road's reflection doesn't. */
export const INTERIOR_LAYER = 1;

/** How far ahead of the eye the rear-view mirror hangs. */
export const MIRROR_DISTANCE = 0.78;
export const MIRROR_OUTER_HEIGHT = 0.087;

const EYE_HEIGHT = 1.22;
const NEAR = 0.15; // far enough out to keep depth precision for the road decals
const REFRAME_RATE = 6;

const FRAMING_KEYS = ['fov', 'pitch', 'roofY', 'mirrorX', 'mirrorY', 'mirrorYaw', 'radioX', 'radioY', 'radioZ', 'radioTilt', 'radioScale', 'radioSide', 'gaugeScale'] as const;

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
}
const LANDSCAPE: Framing = {
  fov: 55, pitch: -0.04, roofY: 0, mirrorX: -0.33, mirrorY: 0.29, mirrorYaw: 0.12,
  // On its own pod, on top of the timer display's housing.
  radioX: -0.58, radioY: -0.345, radioZ: -0.975, radioTilt: -0.2, radioScale: 1, radioSide: 0, gaugeScale: 1
};
/** The roof is framed out of view here, so the mirror hangs just below the top bar instead; see targetFraming. */
const PORTRAIT: Framing = {
  fov: 70, pitch: 0.07, roofY: 0.42, mirrorX: -0.03, mirrorY: 0, mirrorYaw: 0.03,
  // The timer display is out of view here, so it sits on the dash top, left of centre.
  radioX: 0, radioY: -0.22, radioZ: -0.93, radioTilt: -0.26, radioScale: 0.78, radioSide: 1, gaugeScale: 0.78
};

export class Stage {
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
  private mirrorTopPx = 0;

  constructor(canvas: HTMLCanvasElement) {
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

  /** Where the mirror's top edge should sit in portrait, in CSS pixels from the top of the screen. */
  setMirrorTop(px: number): void {
    this.mirrorTopPx = px;
    this.settled = false;
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

  private targetFraming(): Framing {
    if (innerHeight <= innerWidth) return LANDSCAPE;
    // The cockpit hangs off the camera, so this is plain projection with no pitch involved.
    const focal = innerHeight / 2 / Math.tan(THREE.MathUtils.degToRad(PORTRAIT.fov / 2));
    const heightPx = (MIRROR_OUTER_HEIGHT / MIRROR_DISTANCE) * focal;
    const centerPx = this.mirrorTopPx + heightPx / 2;
    return { ...PORTRAIT, mirrorY: ((innerHeight / 2 - centerPx) / focal) * MIRROR_DISTANCE };
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
