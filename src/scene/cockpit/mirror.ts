import * as THREE from 'three';
import { colorTexture, createCanvas } from '../../lib/canvas';
import { clamp } from '../../lib/math';
import type { MirrorLamps } from '../../routes/types';
import { BOX, mesh } from '../geometry';
import { MIRROR_DISTANCE, MIRROR_OUTER_HEIGHT, type Framing } from '../stage';
import type { Outline } from './cockpit';

const HOUSING_MARGIN = 0.012;
const WIDTH = 0.32, HEIGHT = MIRROR_OUTER_HEIGHT - HOUSING_MARGIN, RADIUS = 0.024;
const ROOF_Y = 0.49;
const STEM_WIDTH = 0.018;
const CANVAS_W = 320, CANVAS_H = 92;
const DRAW_INTERVAL = 1 / 15;
/** How far back lamps are drawn, in metres. */
const LAMP_RANGE = 100;
const DASH_SPACING = 10, DASH_COUNT = 8;
/** Projection scale from metres behind the car to canvas pixels. */
const FOCAL = 60;
const HORIZON_Y = 42;
/**
 * The driver sees the mirror from one side, so the rear window is seen at an
 * angle: its near side looms larger and the road's vanishing point slides the
 * other way. Drawn for a driver on the right; the cockpit's own mirroring
 * flips it for the other side.
 */
const VIEW_SHIFT = -14;
const REAR_WINDOW: readonly (readonly [number, number])[] = [[14, 12], [CANVAS_W - 14, 5], [CANVAS_W - 14, 82], [14, 76]];

const ROAD_DRY = new THREE.Color(0x25262c);
const ROAD_WET = new THREE.Color(0x15161b);
const ROAD_SNOW = new THREE.Color(0x8d94a0);

export interface MirrorEnvironment {
  top: THREE.Color;
  bot: THREE.Color;
  fogC: THREE.Color;
  fogD: number;
  wet: number;
  lamp: number;
  head: number;
  rain: number;
  snow: number;
}

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

/** The housing's rounded rectangle as a polygon, so the glass shows right up to its curved corners. */
function roundedOutline(hw: number, hh: number, r: number): THREE.Vector3[] {
  const corners: [number, number][] = [[hw - r, -hh + r], [hw - r, hh - r], [-hw + r, hh - r], [-hw + r, -hh + r]];
  return corners.flatMap(([cx, cy], k) => Array.from({ length: 5 }, (_, i) => {
    const a = ((k - 1) + i / 4) * (Math.PI / 2);
    return new THREE.Vector3(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0);
  }));
}

function quad(x0: number, x1: number, y0: number, y1: number): THREE.Vector3[] {
  return [new THREE.Vector3(x0, y0, 0), new THREE.Vector3(x1, y0, 0), new THREE.Vector3(x1, y1, 0), new THREE.Vector3(x0, y1, 0)];
}

/**
 * The view behind the car, painted on a small canvas rather than rendered from
 * a second camera, which would double the scene's draw calls.
 */
export class Mirror {
  /** Its outline, for finding it on screen. */
  readonly occluders: Outline[];

  private readonly group = new THREE.Group();
  private readonly stem: THREE.Mesh;
  private readonly stemOutline: THREE.Vector3[];
  private readonly ctx: CanvasRenderingContext2D;
  /** The view behind, which the door mirrors show too. */
  readonly texture: THREE.CanvasTexture;
  private readonly skyTop = new THREE.Color();
  private readonly skyBottom = new THREE.Color();
  private readonly fogColor = new THREE.Color();
  private readonly roadColor = new THREE.Color();
  private lampLevel = 0;
  private headLevel = 0;
  private rain = 0;
  private snow = 0;
  private fogVeil = 0;
  private drawTimer = DRAW_INTERVAL;
  private travelled = 0;
  private clock = 0;
  private lampSpacing = Infinity;
  private lampColors: [string, string] = ['', ''];

  constructor(parent: THREE.Object3D, housing: THREE.Material) {
    const { canvas, ctx } = createCanvas(CANVAS_W, CANVAS_H);
    this.ctx = ctx;
    this.texture = colorTexture(canvas);

    const group = this.group;
    group.position.z = -MIRROR_DISTANCE;
    parent.add(group);

    const bodyDepth = 0.022;
    const body = new THREE.Mesh(new THREE.ExtrudeGeometry(roundedRect(WIDTH + HOUSING_MARGIN, HEIGHT + HOUSING_MARGIN, RADIUS + HOUSING_MARGIN / 2), { depth: bodyDepth, bevelEnabled: false, curveSegments: 8 }), housing);
    body.position.z = -bodyDepth;
    group.add(body);
    const face = new THREE.Mesh(faceGeometry(), new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false }));
    face.position.z = 0.001;
    group.add(face);
    this.stem = mesh(BOX, housing, 0, 0, -bodyDepth / 2, STEM_WIDTH, 1, 0.012, group);

    const hw = (WIDTH + HOUSING_MARGIN) / 2, hh = (HEIGHT + HOUSING_MARGIN) / 2;
    this.stemOutline = quad(-STEM_WIDTH / 2, STEM_WIDTH / 2, HEIGHT / 2, HEIGHT / 2);
    this.occluders = [
      { object: group, points: roundedOutline(hw, hh, RADIUS + HOUSING_MARGIN / 2) },
      { object: group, points: this.stemOutline }
    ];
  }

  /** Follows the framing, with its stem reaching up to wherever the roof is. */
  place(framing: Framing): void {
    this.group.position.x = framing.mirrorX;
    this.group.position.y = framing.mirrorY;
    this.group.rotation.y = framing.mirrorYaw; // angled towards the driver, who sits on the right
    const stemBottom = HEIGHT / 2, stemTop = ROOF_Y + framing.roofY - framing.mirrorY;
    this.stem.position.y = (stemBottom + stemTop) / 2;
    this.stem.scale.y = stemTop - stemBottom;
    this.stemOutline[2].y = this.stemOutline[3].y = stemTop;
  }

  /** The streetlights of the road behind, which differ by route. */
  setLamps(lamps: MirrorLamps): void {
    this.lampSpacing = lamps.spacing;
    this.lampColors = lamps.colors.map(hex => {
      const c = new THREE.Color(hex);
      return `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;
    }) as [string, string];
  }

  setEnvironment(env: MirrorEnvironment): void {
    this.skyTop.copy(env.top);
    this.skyBottom.copy(env.bot);
    this.fogColor.copy(env.fogC);
    this.roadColor.copy(ROAD_DRY).lerp(ROAD_WET, env.wet).lerp(ROAD_SNOW, env.snow);
    this.lampLevel = env.lamp;
    this.headLevel = env.head;
    this.rain = env.rain;
    this.snow = env.snow;
    this.fogVeil = clamp((env.fogD - 0.004) * 30, 0, 0.85);
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
    const vx = w / 2 + VIEW_SHIFT - bend * 40000;

    const sky = g.createLinearGradient(0, 0, 0, HORIZON_Y);
    sky.addColorStop(0, '#' + this.skyTop.getHexString());
    sky.addColorStop(1, '#' + this.skyBottom.getHexString());
    g.fillStyle = sky;
    g.fillRect(0, 0, w, HORIZON_Y);

    g.fillStyle = '#101116';
    g.fillRect(0, HORIZON_Y, w, h - HORIZON_Y);
    g.fillStyle = '#' + this.roadColor.getHexString();
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
    const lampCount = Number.isFinite(this.lampSpacing) ? Math.ceil(LAMP_RANGE / this.lampSpacing) : 0;
    for (let i = 0; i < lampCount; i++) {
      const z = (i * this.lampSpacing + this.travelled) % (lampCount * this.lampSpacing) + 4;
      const side = i % 2 ? 1 : -1, s = FOCAL / z;
      this.glow(vx + side * 5 * s, HORIZON_Y - 7 * s, Math.min(26, 3.2 * s), this.lampColors[i % 2], this.lampLevel * 0.9);
    }
    // A car following at a loose distance.
    const followZ = 26 + Math.sin(this.clock * 0.23) * 5, s = FOCAL / followZ;
    for (const side of [-1, 1]) this.glow(vx - 3 * s + side * 0.7 * s, HORIZON_Y + 0.7 * s, 6, '255,244,224', this.headLevel);
    g.globalCompositeOperation = 'source-over';
    this.drawWeather();

    // The car's own rear window frame.
    g.fillStyle = '#050608';
    g.beginPath();
    g.rect(0, 0, w, h);
    this.traceRearWindow();
    g.fill('evenodd');

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

  /** The rear window as a rounded quadrilateral, taller on the side nearer the driver. */
  private traceRearWindow(): void {
    const g = this.ctx, n = REAR_WINDOW.length;
    const [lx, ly] = REAR_WINDOW[n - 1], [fx, fy] = REAR_WINDOW[0];
    g.moveTo((lx + fx) / 2, (ly + fy) / 2);
    for (let i = 0; i < n; i++) {
      const [cx, cy] = REAR_WINDOW[i], [nx, ny] = REAR_WINDOW[(i + 1) % n];
      g.arcTo(cx, cy, nx, ny, 14);
    }
    g.closePath();
  }

  private drawWeather(): void {
    const g = this.ctx, w = CANVAS_W, h = CANVAS_H;
    if (this.fogVeil > 0.01) {
      g.fillStyle = `rgba(${this.fogColor.r * 255},${this.fogColor.g * 255},${this.fogColor.b * 255},${this.fogVeil})`;
      g.fillRect(0, 0, w, h);
    }
    if (this.rain > 0.02) {
      g.strokeStyle = 'rgba(190,205,225,.3)';
      g.lineWidth = 0.7;
      g.beginPath();
      for (let i = 0; i < this.rain * 34; i++) {
        const x = Math.random() * w, y = Math.random() * h;
        // Rain seen from the rear window streaks in towards the road's vanishing point.
        g.moveTo(x, y);
        g.lineTo(x + (w / 2 + VIEW_SHIFT - x) * 0.05, y + 6);
      }
      g.stroke();
    }
    if (this.snow > 0.02) {
      g.fillStyle = 'rgba(245,248,255,.8)';
      for (let i = 0; i < this.snow * 26; i++) {
        const x = (i * 83.3 + Math.sin(this.clock + i) * 5) % w;
        const y = (i * 37.7 + this.clock * 14) % h;
        g.fillRect(x, y, 1.6, 1.6);
      }
    }
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
