import * as THREE from 'three';
import { colorTexture, createCanvas } from '../../lib/canvas';
import { BOX, mesh } from '../geometry';
import type { Framing } from '../stage';

const W = 512, H = 116;
/** The face, in metres. */
const FACE_W = 0.29, FACE_H = FACE_W * (H / W);
/** Where the scale runs across the face, as fractions of its width and height. */
const SLOT_FROM = 0.1, SLOT_TO = 0.9;
const SLOT_Y = 0.6;

/**
 * The music volume, styled like the gauges beside it: amber ticks and figures
 * on black, and a glowing orange needle that slides along the scale.
 */
export class VolumeFader {
  readonly group = new THREE.Group();
  readonly face: THREE.Mesh;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private drawn = -1;

  constructor(parent: THREE.Object3D, housing: THREE.Material) {
    const { canvas, ctx } = createCanvas(W, H);
    this.ctx = ctx;
    this.texture = colorTexture(canvas);
    parent.add(this.group);
    mesh(BOX, housing, 0, 0, -0.016, FACE_W + 0.016, FACE_H + 0.016, 0.03, this.group);
    // Like the other screens, its colour is scaled by the ignition, so it starts dark.
    this.face = mesh(new THREE.PlaneGeometry(FACE_W, FACE_H), new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false, color: 0x000000 }), 0, 0, 0, 1, 1, 1, this.group);
  }

  /** Follows the framing: on the left of the dash, or above the gauges in portrait. */
  place(framing: Framing): void {
    this.group.position.set(framing.faderX, framing.faderY, framing.faderZ);
    this.group.rotation.x = framing.faderTilt;
    this.group.scale.setScalar(framing.faderScale);
  }

  /** The housing's outline, local to `group`, so rain on the glass leaves it clear. */
  get outline(): THREE.Vector3[] {
    const w = FACE_W / 2 + 0.008, h = FACE_H / 2 + 0.008;
    return [new THREE.Vector3(-w, -h, 0), new THREE.Vector3(w, -h, 0), new THREE.Vector3(w, h, 0), new THREE.Vector3(-w, h, 0)];
  }

  /** The two ends of the scale, local to `face`, for turning a pointer position into a level. */
  get slotEnds(): [THREE.Vector3, THREE.Vector3] {
    const y = (0.5 - SLOT_Y) * FACE_H;
    return [new THREE.Vector3((SLOT_FROM - 0.5) * FACE_W, y, 0), new THREE.Vector3((SLOT_TO - 0.5) * FACE_W, y, 0)];
  }

  /** Draws again on the next update, e.g. once the web fonts have loaded. */
  invalidate(): void {
    this.drawn = -1;
  }

  /** Redraws only when the level has visibly moved. */
  draw(level: number): void {
    const rounded = Math.round(level * 400) / 400;
    if (rounded === this.drawn) return;
    this.drawn = rounded;
    const g = this.ctx, x0 = SLOT_FROM * W, x1 = SLOT_TO * W, y = H * SLOT_Y;
    g.fillStyle = '#040405';
    g.fillRect(0, 0, W, H);

    // The same amber scale as the gauges: a faint rule, long ticks every 2, short ones between.
    g.strokeStyle = 'rgba(255,165,80,.35)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x0, y);
    g.lineTo(x1, y);
    g.stroke();
    for (let i = 0; i <= 20; i++) {
      const x = x0 + ((x1 - x0) * i) / 20, major = i % 4 === 0;
      g.strokeStyle = major ? 'rgba(255,190,120,.95)' : 'rgba(255,175,95,.5)';
      g.lineWidth = major ? 2.5 : 1.5;
      g.beginPath();
      g.moveTo(x, y - 2);
      g.lineTo(x, y - (major ? 20 : 11));
      g.stroke();
    }
    g.fillStyle = 'rgba(255,195,130,.9)';
    g.font = '19px Inter, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let i = 0; i <= 10; i += 2) g.fillText(String(i), x0 + ((x1 - x0) * i) / 10, y - 36);
    g.font = '13px Inter, sans-serif';
    g.fillStyle = 'rgba(255,175,95,.55)';
    g.fillText('VOLUME', W / 2, H - 12);

    // The needle, glowing like the gauges' own.
    const x = x0 + (x1 - x0) * level;
    g.save();
    g.shadowColor = '#ff7a1a';
    g.shadowBlur = 12;
    g.strokeStyle = '#ff8c32';
    g.lineWidth = 3.5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x, y - 28);
    g.lineTo(x, y + 14);
    g.stroke();
    g.restore();
    g.fillStyle = '#1a1a1c';
    g.beginPath();
    g.arc(x, y + 14, 7, 0, Math.PI * 2);
    g.fill();
    this.texture.needsUpdate = true;
  }
}
