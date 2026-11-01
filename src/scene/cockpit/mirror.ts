import * as THREE from 'three';
import { colorTexture, createCanvas } from '../../lib/canvas';
import { BOX, mesh } from '../geometry';
import type { GlassOccluder } from './cockpit';

const WIDTH = 0.26, HEIGHT = 0.075, RADIUS = 0.024;
const ROOF_Y = 0.49;
const CANVAS_W = 320, CANVAS_H = 92;
const DRAW_INTERVAL = 1 / 15;
const LAMP_SPACING = 20, LAMP_COUNT = 5;
const DASH_SPACING = 10, DASH_COUNT = 8;
/** Projection scale from metres behind the car to canvas pixels. */
const FOCAL = 60;
const HORIZON_Y = 42;

const TEAL = '159,255,224', SODIUM = '255,180,107';

function roundedRect(w: number, h: number, r: number): THREE.Shape {
  const x = -w / 2, y = -h / 2;
  const s = new THREE.Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** ShapeGeometry's UVs are raw shape coordinates; remaps them to cover the texture. */
function faceGeometry(): THREE.ShapeGeometry {
  const g = new THREE.ShapeGeometry(roundedRect(WIDTH, HEIGHT, RADIUS), 8);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / WIDTH + 0.5, uv.getY(i) / HEIGHT + 0.5);
  return g;
}

function quad(x0: number, x1: number, y0: number, y1: number): THREE.Vector3[] {
  return [new THREE.Vector3(x0, y0, 0), new THREE.Vector3(x1, y0, 0), new THREE.Vector3(x1, y1, 0), new THREE.Vector3(x0, y1, 0)];
}

/**
 * The view behind the car, painted on a small canvas rather than rendered from
 * a second camera, which would double the scene's draw calls.
 */
export class Mirror {
  /** Its outline, so the windshield layer can leave it out. */
  readonly occluders: GlassOccluder[];

  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly skyTop = new THREE.Color();
  private readonly skyBottom = new THREE.Color();
  private lampLevel = 0;
  private headLevel = 0;
  private drawTimer = DRAW_INTERVAL;
  private travelled = 0;
  private clock = 0;

  constructor(roof: THREE.Object3D, housing: THREE.Material) {
    const { canvas, ctx } = createCanvas(CANVAS_W, CANVAS_H);
    this.ctx = ctx;
    this.texture = colorTexture(canvas);

    const group = new THREE.Group();
    group.position.set(-0.33, 0.29, -0.78);
    group.rotation.y = 0.12; // angled towards the driver, who sits on the right
    roof.add(group);

    const bodyDepth = 0.022;
    const body = new THREE.Mesh(new THREE.ExtrudeGeometry(roundedRect(WIDTH + 0.012, HEIGHT + 0.012, RADIUS + 0.006), { depth: bodyDepth, bevelEnabled: false, curveSegments: 8 }), housing);
    body.position.z = -bodyDepth;
    group.add(body);
    const face = new THREE.Mesh(faceGeometry(), new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false }));
    face.position.z = 0.001;
    group.add(face);
    const stemBottom = HEIGHT / 2, stemTop = ROOF_Y - group.position.y;
    mesh(BOX, housing, 0, (stemBottom + stemTop) / 2, -bodyDepth / 2, 0.018, stemTop - stemBottom, 0.012, group);

    const hw = (WIDTH + 0.012) / 2, hh = (HEIGHT + 0.012) / 2;
    this.occluders = [
      { object: group, points: quad(-hw, hw, -hh, hh) },
      { object: group, points: quad(-0.009, 0.009, stemBottom, stemTop) }
    ];
  }

  setLight(top: THREE.Color, bottom: THREE.Color, lamp: number, head: number): void {
    this.skyTop.copy(top);
    this.skyBottom.copy(bottom);
    this.lampLevel = lamp;
    this.headLevel = head;
  }

  update(dt: number, speed: number, bend: number): void {
    this.travelled += speed * dt;
    this.clock += dt;
    this.drawTimer += dt;
    if (this.drawTimer < DRAW_INTERVAL) return;
    this.drawTimer = 0;
    this.draw(bend);
    this.texture.needsUpdate = true;
  }

  private draw(bend: number): void {
    const g = this.ctx, w = CANVAS_W, h = CANVAS_H;
    // The road behind curves the same way as the one ahead, mirrored by being viewed backwards.
    const vx = w / 2 - bend * 40000;

    const sky = g.createLinearGradient(0, 0, 0, HORIZON_Y);
    sky.addColorStop(0, '#' + this.skyTop.getHexString());
    sky.addColorStop(1, '#' + this.skyBottom.getHexString());
    g.fillStyle = sky;
    g.fillRect(0, 0, w, HORIZON_Y);

    g.fillStyle = '#101116';
    g.fillRect(0, HORIZON_Y, w, h - HORIZON_Y);
    g.fillStyle = '#25262c';
    g.beginPath();
    g.moveTo(vx, HORIZON_Y);
    g.lineTo(w * 0.95, h);
    g.lineTo(w * 0.05, h);
    g.fill();

    g.fillStyle = 'rgba(216,216,208,.75)';
    for (let i = 0; i < DASH_COUNT; i++) {
      const z = (i * DASH_SPACING + this.travelled) % (DASH_COUNT * DASH_SPACING) + 3;
      const y = HORIZON_Y + (1.2 * FOCAL) / z, dw = Math.max(0.5, 8 / z), dh = Math.max(0.5, 30 / z);
      g.fillRect(vx - dw / 2, y, dw, dh);
    }

    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < LAMP_COUNT; i++) {
      const z = (i * LAMP_SPACING + this.travelled) % (LAMP_COUNT * LAMP_SPACING) + 4;
      const side = i % 2 ? 1 : -1, s = FOCAL / z;
      this.glow(vx + side * 5 * s, HORIZON_Y - 7 * s, Math.min(26, 3.2 * s), i % 2 ? TEAL : SODIUM, this.lampLevel * 0.9);
    }
    // A car following at a loose distance.
    const followZ = 26 + Math.sin(this.clock * 0.23) * 5, s = FOCAL / followZ;
    for (const side of [-1, 1]) this.glow(vx - 3 * s + side * 0.7 * s, HORIZON_Y + 0.7 * s, 6, '255,244,224', this.headLevel);
    g.globalCompositeOperation = 'source-over';

    // The car's own interior: window frame and rear headrests.
    g.fillStyle = '#050608';
    g.beginPath();
    g.rect(0, 0, w, h);
    g.roundRect(14, 7, w - 28, h - 19, 14);
    g.fill('evenodd');
    g.fillStyle = '#23252c';
    for (const x of [38, 222]) {
      g.beginPath();
      g.roundRect(x, 58, 60, 40, 12);
      g.fill();
    }

    const sheen = g.createLinearGradient(0, 0, w, h);
    sheen.addColorStop(0.3, 'rgba(255,255,255,0)');
    sheen.addColorStop(0.45, 'rgba(255,255,255,.05)');
    sheen.addColorStop(0.6, 'rgba(255,255,255,0)');
    g.fillStyle = sheen;
    g.fillRect(0, 0, w, h);

    // The glass edge, so the mirror still has an outline when the housing is unlit.
    g.strokeStyle = 'rgba(170,178,192,.55)';
    g.lineWidth = 2;
    g.beginPath();
    g.roundRect(1, 1, w - 2, h - 2, (RADIUS / WIDTH) * w);
    g.stroke();
  }

  private glow(x: number, y: number, r: number, rgb: string, alpha: number): void {
    const g = this.ctx;
    const gradient = g.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, `rgba(${rgb},${alpha})`);
    gradient.addColorStop(0.3, `rgba(${rgb},${alpha * 0.4})`);
    gradient.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gradient;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}
