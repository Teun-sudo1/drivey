import * as THREE from 'three';
import type { EngineState } from '../../app/engine';
import { damp, lerp } from '../../lib/math';
import { hideFromReflection } from '../roadSurface';
import { BOX, mesh } from '../geometry';
import { createGauges } from './gauges';
import { createLcd } from './lcd';
import { Mirror } from './mirror';
import { createNav } from './nav';

const GAUGE_INTERVAL = 0.1;
const NAV_INTERVAL = 0.25;
const SWEEP_SECONDS = 1.2;
/** Far enough in that the display stays fully on screen at a 16:10 laptop's aspect ratio. */
const LCD_X = -0.58;
const SCREEN_POWER_RATE = 6;
/** Full brightness of the gauges, LCD and nav screen. */
const SCREEN_LEVELS = [1, 1, 0.73];
const PILLAR_WIDTH = 0.11;

/** Part of the interior that sits in front of the windshield, as a polygon local to `object`. */
export interface GlassOccluder {
  object: THREE.Object3D;
  points: THREE.Vector3[];
}

/** Low-poly interior, parented to the camera so it never leaves the frame. */
export class Cockpit {
  readonly dashLight = new THREE.PointLight(0xff9a50, 0.1, 0.8, 2);
  // Short range: it lights the interior but must not reach the road, 1.77 below it.
  readonly passLight = new THREE.PointLight(0xffffff, 0, 1.7, 1.5);
  readonly roof = new THREE.Group();
  readonly wheel = new THREE.Group();
  readonly mirror: Mirror;
  readonly glassOccluders: GlassOccluder[];

  private readonly root = new THREE.Group();
  private readonly screens: THREE.Mesh[];
  private side = 1;
  private engine: EngineState = 'off';
  private power = 0;
  private sweepLeft = 0;
  private readonly gauges = createGauges();
  private readonly lcd = createLcd();
  private readonly nav = createNav();
  private gaugeTimer = GAUGE_INTERVAL;
  private navTimer = NAV_INTERVAL;
  private navOffset = 0;
  private lcdKey = '';

  constructor(camera: THREE.Camera, private routeName: string) {
    const root = this.root;
    camera.add(root);

    const intA = new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.85 });
    const intB = new THREE.MeshStandardMaterial({ color: 0x0a0b0d, roughness: 0.95 });

    mesh(BOX, intA, -0.35, -0.69, -1.16, 2.5, 0.44, 0.42, root);
    mesh(BOX, intA, -0.35, -0.86, -0.85, 2.5, 0.3, 0.3, root);
    mesh(BOX, intB, -0.35, -0.48, -1.4, 2.6, 0.04, 0.12, root);
    mesh(BOX, intB, 0, -0.285, -0.95, 0.58, 0.04, 0.14, root).rotation.x = 0.18;
    mesh(BOX, intB, 0, -0.4, -0.92, 0.58, 0.19, 0.05, root);

    const screen = (texture: THREE.Texture) => new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, color: 0x000000 });
    const gaugeScreen = mesh(new THREE.PlaneGeometry(0.5, 0.164), screen(this.gauges.texture), 0, -0.4, -0.893, 1, 1, 1, root);
    mesh(BOX, intB, LCD_X, -0.435, -0.98, 0.37, 0.1, 0.14, root);
    const lcdScreen = mesh(new THREE.PlaneGeometry(0.31, 0.0775), screen(this.lcd.texture), LCD_X, -0.435, -0.909, 1, 1, 1, root);

    const navUnit = new THREE.Group();
    navUnit.position.set(0.5, -0.25, -0.86);
    navUnit.rotation.y = -0.35;
    root.add(navUnit);
    mesh(BOX, intB, 0, 0, -0.012, 0.2, 0.29, 0.02, navUnit);
    const navScreen = mesh(new THREE.PlaneGeometry(0.18, 0.27), screen(this.nav.texture), 0, 0, 0, 1, 1, 1, navUnit);
    this.screens = [gaugeScreen, lcdScreen, navScreen];

    this.wheel.position.set(0, -0.47, -0.6);
    this.wheel.rotation.x = -0.35;
    root.add(this.wheel);
    mesh(new THREE.TorusGeometry(0.2, 0.024, 12, 48), intA, 0, 0, 0, 1, 1, 1, this.wheel);
    mesh(BOX, intB, 0, -0.02, 0, 0.34, 0.035, 0.02, this.wheel);
    mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.05, 20), intA, 0, -0.02, 0, 1, 1, 1, this.wheel).rotation.x = Math.PI / 2;

    root.add(this.roof);
    mesh(BOX, intB, -0.35, 0.52, -0.82, 2.8, 0.07, 0.55, this.roof);
    this.mirror = new Mirror(root, intB);

    this.dashLight.position.set(0, -0.36, -0.82);
    this.passLight.position.set(-0.2, 0.55, -0.5);
    root.add(this.dashLight, this.passLight);

    const pillars = this.addPillars(root, intB);
    hideFromReflection(root);

    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    this.glassOccluders = [
      ...this.mirror.occluders,
      ...pillars,
      { object: navUnit, points: [V(-0.1, -0.145, 0), V(0.1, -0.145, 0), V(0.1, 0.145, 0), V(-0.1, 0.145, 0)] },
      { object: root, points: [V(-0.29, -0.265, -1.02), V(0.29, -0.265, -1.02), V(0.29, -0.5, -0.9), V(-0.29, -0.5, -0.9)] }
    ];
  }

  /** 1 is the right-hand-drive interior as built; -1 mirrors it for a left-hand-drive car. */
  setSide(side: number): void {
    this.side = side;
    this.root.scale.x = side;
    for (const s of this.screens) s.scale.x = side;
  }

  /** Mirroring the interior would otherwise turn the wheel the wrong way. */
  steer(bend: number): void {
    this.wheel.rotation.z = bend * 900 * this.side;
  }

  /** Screens light with the ignition, and at ON the needles sweep their full travel, like a real self-test. */
  setEngine(state: EngineState): void {
    if (state === 'on' && this.engine !== 'cranking' && this.engine !== 'running') this.sweepLeft = SWEEP_SECONDS;
    this.engine = state;
  }

  update(dt: number, speed: number, bend: number, clock: number): void {
    this.mirror.update(dt, speed, bend);
    const power = lerp(this.power, this.engine === 'off' ? 0 : 1, damp(SCREEN_POWER_RATE, dt));
    if (power !== this.power) {
      this.power = power;
      this.screens.forEach((s, i) => (s.material as THREE.MeshBasicMaterial).color.setScalar(power * SCREEN_LEVELS[i]));
    }
    this.sweepLeft = Math.max(0, this.sweepLeft - dt);
    this.gaugeTimer += dt;
    if (this.gaugeTimer >= GAUGE_INTERVAL) {
      this.gaugeTimer = 0;
      const sweep = Math.sin(Math.PI * (this.sweepLeft / SWEEP_SECONDS));
      const kmh = speed * 3.6;
      this.gauges.draw(Math.max(kmh, sweep * 180), this.rpm(kmh, sweep, clock));
    }
    this.navTimer += dt;
    if (this.navTimer >= NAV_INTERVAL) {
      this.navOffset += speed * this.navTimer * 0.6;
      this.navTimer = 0;
      this.nav.draw(this.navOffset, bend, this.routeName);
    }
  }

  showTime(txt: string, label: string): void {
    const key = txt + label;
    if (key === this.lcdKey) return;
    this.lcdKey = key;
    this.lcd.draw(txt, label);
  }

  /** Canvas text drawn before the web fonts load must be redrawn once they arrive. */
  setRouteName(name: string): void {
    this.routeName = name;
    this.navTimer = NAV_INTERVAL;
  }

  invalidateText(): void {
    this.lcdKey = '';
    this.gaugeTimer = GAUGE_INTERVAL;
    this.navTimer = NAV_INTERVAL;
  }

  private rpm(kmh: number, sweep: number, clock: number): number {
    if (this.engine === 'running') return 1.1 + kmh / 45 + Math.sin(clock * 3) * 0.03;
    if (this.engine === 'cranking') return 0.5 + Math.abs(Math.sin(clock * 22)) * 0.5;
    return sweep * 8;
  }

  /** The A-pillars, returning each one's outline plus everything beyond it, where the glass ends. */
  private addPillars(root: THREE.Group, material: THREE.Material): GlassOccluder[] {
    const ends: [THREE.Vector3, THREE.Vector3, number][] = [
      [new THREE.Vector3(-1.25, -0.47, -1.38), new THREE.Vector3(-0.98, 0.5, -0.78), -1],
      [new THREE.Vector3(0.66, -0.47, -1.38), new THREE.Vector3(0.52, 0.5, -0.78), 1]
    ];
    return ends.map(([a, b, outward]) => {
      const pillar = new THREE.Mesh(BOX, material);
      pillar.scale.set(PILLAR_WIDTH, 0.08, a.distanceTo(b));
      pillar.position.copy(a).add(b).multiplyScalar(0.5);
      // lookAt works in world space, so aim it while it has no parent.
      pillar.lookAt(b);
      root.add(pillar);
      const inner = -outward * PILLAR_WIDTH / 2;
      return {
        object: root,
        points: [
          new THREE.Vector3(a.x + inner, a.y - 0.1, a.z),
          new THREE.Vector3(b.x + inner, b.y + 0.1, b.z),
          new THREE.Vector3(b.x + outward * 3, b.y + 0.1, b.z),
          new THREE.Vector3(a.x + outward * 3, a.y - 0.1, a.z)
        ]
      };
    });
  }
}
