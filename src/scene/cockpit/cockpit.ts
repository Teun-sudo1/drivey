import * as THREE from 'three';
import type { EngineState } from '../../app/carEngine';
import { damp, lerp } from '../../lib/math';
import { hideFromReflection } from '../roadSurface';
import { BOX, PLANE, mergeStatic, mesh } from '../geometry';
import { createGauges } from './gauges';
import { createLcd } from './lcd';
import { Mirror } from './mirror';
import { createNav } from './nav';
import { CarRadio, type RadioState } from './radio';

const GAUGE_INTERVAL = 0.1;
const NAV_INTERVAL = 0.25;
const LOADING_INTERVAL = 1 / 30;
/** Which of the screens is the nav unit's. */
const NAV_SCREEN = 2;
const SWEEP_SECONDS = 1.2;
/** Far enough in that the display stays fully on screen at a 16:10 laptop's aspect ratio. */
const SCREEN_POWER_RATE = 6;
/** How quickly the tuning needle slides to a new station. */
const DIAL_RATE = 5;
/** Full brightness of the gauges, LCD, nav screen and radio. */
const SCREEN_LEVELS = [1, 1, 0.73, 1];
const PILLAR_WIDTH = 0.11;
/** The roof light's brightness, and how quickly it fades like an old bulb. */
const CABIN_LIGHT = 7;
const CABIN_FADE_RATE = 2.5;
/** Indicator flashes per second. */
const BLINK_HZ = 1.5;
/** Each A-pillar's foot and head, and which way is out of the car. */
const PILLAR_ENDS: [THREE.Vector3, THREE.Vector3, number][] = [
  [new THREE.Vector3(-1.5, -0.47, -1.38), new THREE.Vector3(-1.2, 0.5, -0.78), -1],
  [new THREE.Vector3(0.98, -0.47, -1.38), new THREE.Vector3(0.82, 0.5, -0.78), 1]
];
/** The door sill, where the side windows start. */
const SILL_Y = -0.42;
/** Where the side windows stop being drawn: just ahead of the eye, since points behind it would project flipped. */
const SIDE_WINDOW_END = -0.05;
/** Where the lever leaves the console, how far it leans back, and its reach up into the gap between radio and wheel. */
const GEAR_LEVER = { x: -0.36, y: -0.64, z: -0.6, lean: 0.25, length: 0.24, knob: 0.032 };

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
  /** The lit indicator in each door mirror's outer end: towards lower lane numbers, then higher. */
  private readonly blinkers: [THREE.Mesh, THREE.Mesh];
  private signal = 0;
  /** The roof light, on while the driver settles in; short range, so it stays off the road. */
  readonly cabinLight = new THREE.PointLight(0xffd6a0, 0, 1.5, 1.5);
  private cabinLevel = 0;
  /** 1 while the nav unit shows its loading screen, which it does with the engine off. */
  private navLoading = false;
  readonly roof = new THREE.Group();
  readonly wheel = new THREE.Group();
  /** The long 80s lever, rising between the seats into the lower corner of the view. */
  readonly gearLever: THREE.Group;
  readonly mirror: Mirror;
  readonly radio: CarRadio;
  /** What the radio shows; the dial eases to the station on its own. */
  readonly radioState: RadioState = { dial: 0, station: 0, volume: 0, on: true };
  readonly glassOccluders: GlassOccluder[];
  /** The A-pillars' outlines, which mark where the glass ends at the sides. */
  readonly pillars: GlassOccluder[];
  /** The side windows beyond the pillars, down to the door sills. */
  readonly sideWindows: GlassOccluder[];

  private readonly root = new THREE.Group();
  private readonly screens: THREE.Mesh[];
  private side = 1;
  private engine: EngineState = 'off';
  private power = 0;
  private navPower = 0;
  private sweepLeft = 0;
  private readonly gauges = createGauges();
  private readonly lcd = createLcd();
  private readonly lcdScreen: THREE.Mesh;
  private readonly gaugeScreen: THREE.Mesh;
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

    // Everything fixed in place, merged by material once built so the whole cabin costs a few draw calls.
    const cabin = new THREE.Group();
    root.add(cabin);
    mesh(BOX, intA, -0.26, -0.69, -1.16, 2.9, 0.44, 0.42, cabin);
    mesh(BOX, intA, -0.26, -0.86, -0.85, 2.9, 0.3, 0.3, cabin);
    mesh(BOX, intB, -0.26, -0.48, -1.4, 3.0, 0.04, 0.12, cabin);
    mesh(BOX, intB, 0, -0.285, -0.95, 0.58, 0.04, 0.14, cabin).rotation.x = 0.18;
    mesh(BOX, intB, 0, -0.4, -0.92, 0.58, 0.19, 0.05, cabin);

    const screen = (texture: THREE.Texture) => new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, color: 0x000000 });
    const gaugeScreen = mesh(new THREE.PlaneGeometry(0.5, 0.164), screen(this.gauges.texture), 0, -0.4, -0.893, 1, 1, 1, root);
    this.radio = new CarRadio(root, intB);
    // The timer's display, in the radio's housing.
    this.lcdScreen = mesh(PLANE, screen(this.lcd.textures.wide), 0, 0, 0, 1, 1, 1, this.radio.display);

    const navUnit = new THREE.Group();
    navUnit.position.set(0.5, -0.25, -0.86);
    navUnit.rotation.y = -0.35;
    root.add(navUnit);
    mesh(BOX, intB, 0, 0, -0.012, 0.2, 0.29, 0.02, navUnit);
    const navScreen = mesh(new THREE.PlaneGeometry(0.18, 0.27), screen(this.nav.texture), 0, 0, 0, 1, 1, 1, navUnit);
    this.gaugeScreen = gaugeScreen;
    this.screens = [gaugeScreen, this.lcdScreen, navScreen];

    this.wheel.position.set(0, -0.4, -0.6);
    this.wheel.rotation.x = -0.35;
    root.add(this.wheel);
    mesh(new THREE.TorusGeometry(0.2, 0.024, 12, 48), intA, 0, 0, 0, 1, 1, 1, this.wheel);
    mesh(BOX, intB, 0, -0.02, 0, 0.34, 0.035, 0.02, this.wheel);
    mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.05, 20), intA, 0, -0.02, 0, 1, 1, 1, this.wheel).rotation.x = Math.PI / 2;

    this.gearLever = this.addGearLever(root, intA, intB);
    this.addCabin(cabin, intA, intB);
    this.blinkers = this.addSideMirrors(cabin, root, intB);
    mergeStatic(cabin);

    root.add(this.roof);
    // Deep enough to cover the eye when it sits back from the wheel.
    // Just reaching the pillars' heads, so it never sticks out past the car's sides.
    mesh(BOX, intB, -0.19, 0.52, -0.35, 2.06, 0.07, 1.5, this.roof);
    this.mirror = new Mirror(root, intB);
    this.screens.push(this.radio.face);

    this.dashLight.position.set(0, -0.36, -0.82);
    this.passLight.position.set(-0.2, 0.55, -0.5);
    this.cabinLight.position.set(-0.35, 0.44, -0.35);
    root.add(this.dashLight, this.passLight, this.cabinLight);

    this.pillars = this.addPillars(root, intB);
    this.sideWindows = PILLAR_ENDS.map(([a, b, outward]) => {
      const outer = outward * PILLAR_WIDTH / 2;
      return {
        object: root,
        points: [
          new THREE.Vector3(a.x + outer, SILL_Y, a.z),
          new THREE.Vector3(b.x + outer, b.y + 0.1, b.z),
          // Back beside the eye, which sees that far when sitting back.
          new THREE.Vector3(b.x + outward * 3, b.y + 0.1, SIDE_WINDOW_END),
          new THREE.Vector3(a.x + outward * 3, SILL_Y, SIDE_WINDOW_END)
        ]
      };
    });
    hideFromReflection(root);

    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    this.glassOccluders = [
      ...this.mirror.occluders,
      ...this.pillars,
      { object: this.radio.group, points: this.radio.outline },
      // The wheel's rim rises above the dash, most of all when sitting back.
      { object: this.wheel, points: Array.from({ length: 16 }, (_, i) => V(Math.cos((i / 16) * Math.PI * 2) * 0.225, Math.sin((i / 16) * Math.PI * 2) * 0.225, 0)) },
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

  /** Sits the eye back from the wheel and tilts it down into the car; the interior itself doesn't move in the car. */
  seat(back: number, lookDown: number): void {
    this.root.rotation.x = lookDown;
    this.root.position.set(0, Math.sin(lookDown) * back, -Math.cos(lookDown) * back);
  }

  /** Sizes the gauges for the framing, keeping them mirrored with the interior. */
  scaleGauges(scale: number): void {
    this.gaugeScreen.scale.set(scale * this.side, scale, 1);
  }

  /** Whether an indicator lamp is lit at this moment. */
  get indicatorLit(): boolean {
    return this.blinkers[0].visible || this.blinkers[1].visible;
  }

  /** Which way the indicator is on, as Traffic.ownSignal gives it; it blinks in that side's door mirror. */
  setSignal(direction: number): void {
    this.signal = direction;
  }

  setNavLoading(on: boolean): void {
    this.navLoading = on;
    this.navTimer = NAV_INTERVAL;
  }

  setCabinLight(on: boolean): void {
    this.cabinLevel = on ? CABIN_LIGHT : 0;
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
    const blinkOn = this.signal !== 0 && (clock * BLINK_HZ) % 1 < 0.55;
    this.blinkers[0].visible = blinkOn && this.signal < 0;
    this.blinkers[1].visible = blinkOn && this.signal > 0;
    this.cabinLight.intensity = lerp(this.cabinLight.intensity, this.cabinLevel, damp(CABIN_FADE_RATE, dt));
    const power = lerp(this.power, this.engine === 'off' ? 0 : 1, damp(SCREEN_POWER_RATE, dt));
    const navPower = lerp(this.navPower, this.navLoading ? 1 : power, damp(SCREEN_POWER_RATE, dt));
    if (power !== this.power || navPower !== this.navPower) {
      this.power = power;
      this.navPower = navPower;
      this.screens.forEach((s, i) => (s.material as THREE.MeshBasicMaterial).color.setScalar((i === NAV_SCREEN ? navPower : power) * SCREEN_LEVELS[i]));
    }
    // Beside the radio on a phone, the display takes its squarer shape.
    const lcdMaterial = this.lcdScreen.material as THREE.MeshBasicMaterial, lcdMap = this.radio.compact ? this.lcd.textures.compact : this.lcd.textures.wide;
    if (lcdMaterial.map !== lcdMap) {
      lcdMaterial.map = lcdMap;
      lcdMaterial.needsUpdate = true;
    }
    const r = this.radioState;
    r.dial = Math.abs(r.dial - r.station) < 0.005 ? r.station : lerp(r.dial, r.station, damp(DIAL_RATE, dt));
    this.radio.draw(r);
    this.sweepLeft = Math.max(0, this.sweepLeft - dt);
    this.gaugeTimer += dt;
    if (this.gaugeTimer >= GAUGE_INTERVAL) {
      this.gaugeTimer = 0;
      const sweep = Math.sin(Math.PI * (this.sweepLeft / SWEEP_SECONDS));
      const kmh = speed * 3.6;
      this.gauges.draw(Math.max(kmh, sweep * 180), this.rpm(kmh, sweep, clock));
    }
    this.navTimer += dt;
    if (this.navLoading) {
      // Redrawn often enough for the dial to turn smoothly.
      if (this.navTimer >= LOADING_INTERVAL) {
        this.navTimer = 0;
        this.nav.drawLoading(clock, this.routeName);
      }
    } else if (this.navTimer >= NAV_INTERVAL) {
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
    this.radio.invalidate();
    this.lcdKey = '';
    this.gaugeTimer = GAUGE_INTERVAL;
    this.navTimer = NAV_INTERVAL;
  }

  private rpm(kmh: number, sweep: number, clock: number): number {
    if (this.engine === 'running') return 1.1 + kmh / 45 + Math.sin(clock * 3) * 0.03;
    if (this.engine === 'cranking') return 0.5 + Math.abs(Math.sin(clock * 22)) * 0.5;
    return sweep * 8;
  }

  /** Doors, floor, the console between the seats, and the passenger's side of the dash. */
  private addCabin(cabin: THREE.Group, panel: THREE.Material, trim: THREE.Material): void {
    for (const x of [-1.55, 1.04]) {
      mesh(BOX, panel, x, -0.76, -0.4, 0.08, 0.62, 2.2, cabin);
      mesh(BOX, trim, x + Math.sign(x + 0.35) * -0.02, -0.44, -0.4, 0.12, 0.04, 2.2, cabin);
    }
    mesh(BOX, trim, -0.26, -1.06, -0.4, 2.6, 0.04, 2.2, cabin);
    mesh(BOX, trim, -0.36, -0.82, -0.3, 0.22, 0.38, 1.1, cabin);
    mesh(BOX, panel, -0.36, -0.62, 0.02, 0.2, 0.05, 0.36, cabin);
    // The passenger's side of the dash: a glovebox with its catch, and an air vent at the end.
    const lid = new THREE.MeshStandardMaterial({ color: 0x1e1f23, roughness: 0.7 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0x8a8b90, roughness: 0.35, metalness: 0.8 });
    mesh(BOX, lid, -0.86, -0.6, -0.944, 0.42, 0.15, 0.012, cabin);
    mesh(BOX, chrome, -0.73, -0.56, -0.936, 0.07, 0.014, 0.01, cabin);
    mesh(BOX, trim, -1.16, -0.53, -0.944, 0.16, 0.07, 0.012, cabin);
    for (let i = 0; i < 3; i++) mesh(BOX, panel, -1.16, -0.552 + i * 0.022, -0.936, 0.15, 0.006, 0.006, cabin);
  }

  /** A mirror on each door, just beyond the pillar's foot, angled back at the driver, with an indicator at its outer end. */
  private addSideMirrors(cabin: THREE.Group, root: THREE.Group, housing: THREE.Material): [THREE.Mesh, THREE.Mesh] {
    // Shows a dim sky, as a mirror does even at night, so it reads as glass rather than more trim.
    const glass = new THREE.MeshBasicMaterial({ color: 0x2c3544 });
    const lit = new THREE.MeshBasicMaterial({ color: 0xffa424, toneMapped: false });
    const lights = PILLAR_ENDS.map(([foot, , outward]) => {
      const x = foot.x + outward * 0.2, y = foot.y + 0.1, z = foot.z + 0.12, yaw = -outward * 0.35;
      mesh(BOX, housing, x, y, z, 0.22, 0.12, 0.07, cabin).rotation.y = yaw;
      mesh(PLANE, glass, x - outward * 0.005, y, z + 0.037, 0.19, 0.095, 1, cabin).rotation.y = yaw;
      const light = mesh(BOX, lit, x + outward * 0.1 * Math.cos(yaw), y, z - outward * 0.1 * Math.sin(yaw), 0.03, 0.07, 0.075, root);
      light.rotation.y = yaw;
      light.visible = false;
      return light;
    });
    return [lights[0], lights[1]];
  }

  /** Rod, rubber boot and knob, leaning back towards the driver from the console. */
  private addGearLever(root: THREE.Group, material: THREE.Material, dark: THREE.Material): THREE.Group {
    const lever = new THREE.Group();
    lever.position.set(GEAR_LEVER.x, GEAR_LEVER.y, GEAR_LEVER.z);
    lever.rotation.x = GEAR_LEVER.lean;
    root.add(lever);
    mesh(new THREE.ConeGeometry(0.075, 0.16, 12, 1, true), dark, 0, 0.08, 0, 1, 1, 1, lever);
    mesh(new THREE.CylinderGeometry(0.009, 0.011, GEAR_LEVER.length, 8), material, 0, GEAR_LEVER.length / 2, 0, 1, 1, 1, lever);
    // Polished, so it catches the dash glow and passing lights where everything else is matte.
    const knob = new THREE.MeshStandardMaterial({ color: 0x2c2c31, roughness: 0.3, metalness: 0.4 });
    mesh(new THREE.SphereGeometry(GEAR_LEVER.knob, 16, 12), knob, 0, GEAR_LEVER.length, 0, 1, 0.9, 1, lever);
    return lever;
  }

  /** The A-pillars, returning each one's outline plus everything beyond it, where the glass ends. */
  private addPillars(root: THREE.Group, material: THREE.Material): GlassOccluder[] {
    return PILLAR_ENDS.map(([a, b, outward]) => {
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
