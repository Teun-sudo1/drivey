import * as THREE from 'three';
import { colorTexture, createCanvas } from '../lib/canvas';
import { damp, lerp } from '../lib/math';

const EYE_HEIGHT = 1.22;
const NEAR = 0.15; // far enough out to keep depth precision for the road decals
const REFRAME_RATE = 6;

/** How the camera frames the car in each orientation. */
interface Framing {
  fov: number;
  pitch: number;
  roofY: number;
}
const LANDSCAPE: Framing = { fov: 55, pitch: -0.04, roofY: 0 };
const PORTRAIT: Framing = { fov: 70, pitch: 0.07, roofY: 0.42 };

export class Stage {
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
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene.fog = this.fog;
    this.camera.position.set(0, EYE_HEIGHT, 0);
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

  /** Eases towards the framing for the current orientation, so rotation doesn't jump. */
  updateFraming(dt: number, snap: boolean): void {
    if (this.settled) return;
    const target = this.targetFraming();
    const k = snap ? 1 : damp(REFRAME_RATE, dt);
    this.framing.fov = lerp(this.framing.fov, target.fov, k);
    this.framing.pitch = lerp(this.framing.pitch, target.pitch, k);
    this.framing.roofY = lerp(this.framing.roofY, target.roofY, k);
    if (Math.abs(this.framing.fov - target.fov) < 0.01) {
      Object.assign(this.framing, target);
      this.settled = true;
    }
    this.camera.fov = this.framing.fov;
    this.camera.updateProjectionMatrix();
  }

  private targetFraming(): Framing {
    return innerHeight > innerWidth ? PORTRAIT : LANDSCAPE;
  }

  private resize(): void {
    const w = innerWidth, h = innerHeight;
    const pixelRatio = Math.min(devicePixelRatio, 2);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.settled = false;
    for (const listener of this.resizeListeners) listener(w, h, pixelRatio);
  }
}
