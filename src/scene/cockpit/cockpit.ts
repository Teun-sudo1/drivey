import * as THREE from 'three';
import type { EngineState } from '../../app/carEngine';
import { damp, lerp } from '../../lib/math';
import { hideFromReflection } from '../roadSurface';
import { BOX, CAP_BOX, PLANE, flatten, mergeStatic, mesh } from '../geometry';
import { colorTexture, fogPatches, sideDrops } from '../../lib/canvas';
import { createGauges } from './gauges';
import { createClimate } from './climate';
import { createLcd } from './lcd';
import { Mirror } from './mirror';
import { createNav } from './nav';
import { GLASS_X0, GLASS_X1 } from '../../weather/windshield';
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
const SCREEN_LEVELS = [1, 1, 0.73, 1, 1];
const PILLAR_WIDTH = 0.16;
/** How far right of the car's original driving position the driver's seat, wheel and gauges sit. */
const DRIVER_X = 0.25;
/** The roof light's brightness, and how quickly it fades like an old bulb. */
const CABIN_LIGHT = 7;
const CABIN_FADE_RATE = 2.5;
/** Indicator flashes per second. */
const BLINK_HZ = 1.5;
/** Each A-pillar's foot and head, and which way is out of the car. */
const PILLAR_ENDS: [THREE.Vector3, THREE.Vector3, number][] = [
  [new THREE.Vector3(-1.5, -0.47, -1.45), new THREE.Vector3(-1.15, 0.5, -0.5), -1],
  [new THREE.Vector3(0.98, -0.47, -1.45), new THREE.Vector3(0.77, 0.5, -0.5), 1]
];
/** How far the fan knob turns either way, and half the temperature slot's length, local to the climate panel. */
const FAN_STOP = 2.4, TEMP_SLOT = 0.0283;
/** How much thicker the side windows' fog shows than the windshield's thin film, so its patches read. */
const SIDE_FOG_GAIN = 3;
/** How fast drops on the side windows drift back, in texture widths per metre driven. */
const SIDE_RAIN_DRIFT = 0.004;
/** How far back the steamed-up side windows reach: past the eye sat all the way back. */
const SIDE_PANE_END = 0.6;
/** How far back of the wheel the eye sits, on average across the seat range, for fitting the glass to the pillars. */
const GLASS_EYE_BACK = 0.1;
/** Where the roof's front edge runs, above the windshield, and how far up each pillar starts sweeping into it. */
const ROOF_EDGE = { y: 0.487, z: -1.09 }, PILLAR_SWEEP_FROM = 0.45;
/** Where the lever leaves the console, how far it leans back, and its reach up into the gap between radio and wheel. */
const GEAR_LEVER = { x: -0.4, y: -0.78, z: -0.4, lean: 0.2, length: 0.26, knob: 0.034 };

const BONNET_WING_X = 1.12;

/**
 * The bonnet as one smooth panel, 2.6 by 2.4 m: a slight crown down the middle, rounded wings rising
 * along each side, and a nose that rolls down at the front, all in one curved surface.
 */
function bonnetGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(2.6, 2.4, 40, 16);
  geometry.rotateX(-Math.PI / 2);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const u = Math.abs(x) / 1.3, front = Math.max(0, (-z - 0.9) / 0.3);
    const crown = 0.05 * (1 - u * u);
    const wing = 0.11 * Math.exp(-(((Math.abs(x) - BONNET_WING_X) / 0.14) ** 2));
    const roll = 0.12 * front * front;
    const edge = 0.1 * Math.max(0, (u - 0.96) / 0.04);
    p.setY(i, crown + wing - roll - edge);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** The outline of a part of the interior, as a polygon local to `object`, for finding it on screen. */
export interface Outline {
  object: THREE.Object3D;
  points: THREE.Vector3[];
}

/** Low-poly interior, parented to the camera so it never leaves the frame. */
export class Cockpit {
  readonly dashLight = new THREE.PointLight(0xff9a50, 0.1, 1.5, 2);
  // Short range: it lights the interior but must not reach the road, 1.77 below it.
  readonly passLight = new THREE.PointLight(0xffffff, 0, 1.7, 1.5);
  /** The lit indicator in each door mirror's outer end: towards lower lane numbers, then higher. */
  private readonly blinkers: [THREE.Mesh, THREE.Mesh];
  private signal = 0;
  /** The A/C button on the climate stack, which the page listens for taps on. */
  acButton!: THREE.Mesh;
  /** The fan knob and temperature lever: they turn and slide when played with, though only for show. */
  fanKnob!: THREE.Group;
  tempLever!: THREE.Mesh;
  private readonly headTurn = new THREE.Euler();
  private readonly climate = createClimate();
  /** The headlamp lenses at the front of the wings, lit with the headlights. */
  private readonly sideMist = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  private readonly sidePanes: THREE.Mesh[] = [];
  private readonly sideFog = colorTexture(fogPatches(256, 256));
  /** Rain on the side windows, blown back along the glass as the car goes. */
  private readonly sideRainTexture = Object.assign(colorTexture(sideDrops(256)), { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, repeat: new THREE.Vector2(5, 3) });
  private readonly sideRain = new THREE.MeshBasicMaterial({ map: this.sideRainTexture, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, opacity: 0 });
  private readonly rainPanes: THREE.Mesh[] = [];
  private readonly lampGlass = new THREE.MeshBasicMaterial({ color: 0x555049, toneMapped: false });
  /** One chrome for the badge, pedals, door pull and wheel trim, so the parts share draw calls. */
  private readonly chrome = new THREE.MeshStandardMaterial({ color: 0xb8bac0, roughness: 0.25, metalness: 0.9 });
  /** Tips up or down while signalling, as the real stalk is pushed. */
  private indicatorStalk!: THREE.Group;
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
  /** The A-pillars' outlines, which mark where the glass ends at the sides. */
  readonly pillars: Outline[];

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

    // An 80s car in maroon: the vinyl dash, door cards and paintwork alike, with black wheel and trim.
    const intA = new THREE.MeshStandardMaterial({ color: 0x4a2523, roughness: 0.8 });
    const intB = new THREE.MeshStandardMaterial({ color: 0x120d0d, roughness: 0.9 });

    // Everything fixed in place, merged by material once built so the whole cabin costs a few draw calls.
    const cabin = new THREE.Group();
    root.add(cabin);
    // The dash: a deep slab whose top rolls towards the glass, and the bonnet beyond it.
    // Shallow enough to leave the footwells open below it, where the legs go.
    mesh(BOX, intA, -0.26, -0.64, -1.12, 2.9, 0.34, 0.5, cabin);
    mesh(BOX, intA, -0.26, -0.5, -1.25, 2.9, 0.08, 0.3, cabin).rotation.x = 0.25;
    // The bonnet: a gently domed panel with a rounded nose, and raised wings either side ending in round headlamps.
    const bonnet = new THREE.Group();
    // Level with the foot of the pillars.
    bonnet.position.set(-0.26, -0.5, -2.5);
    bonnet.scale.z = 0.9;
    bonnet.rotation.x = 0.06;
    cabin.add(bonnet);
    mesh(bonnetGeometry(), intA, 0, 0, 0, 1, 1, 1, bonnet);
    // A crease down the middle, washer jets by the windscreen, and a chrome badge on the nose.
    // The crease runs from the windscreen to the vent.
    mesh(BOX, intA, 0, 0.05, 0.42, 0.07, 0.006, 1.36, bonnet);
    for (const x of [-0.35, 0.35]) mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.02, 10), intB, x, 0.055, 1.05, 1, 1, 1, bonnet);
    mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.01, 20), this.chrome, 0, -0.05, -1.13, 1, 1, 1, bonnet).rotation.x = 1.0;
    for (const side of [-1, 1]) {
      mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 20), this.lampGlass, side * BONNET_WING_X, -0.03, -1.2, 1, 1, 1, bonnet).rotation.x = Math.PI / 2;
    }
    // A slatted vent in the bonnet, ahead of the windscreen.
    // A raised lip round a dark recess, with louvres angled back towards the windscreen.
    const vent = new THREE.Group();
    vent.position.set(-0.26, -0.43, -2.9);
    vent.rotation.x = 0.06;
    cabin.add(vent);
    mesh(BOX, intA, 0, 0.004, 0, 0.8, 0.02, 0.36, vent);
    mesh(BOX, intB, 0, 0.012, 0, 0.72, 0.012, 0.3, vent);
    for (let i = 0; i < 7; i++) mesh(BOX, intA, 0, 0.02, -0.12 + i * 0.04, 0.7, 0.006, 0.03, vent).rotation.x = -0.55;
    // Defrost slots along the top, and round vents at each end of the face.
    for (const x of [-1.05, -0.45, 0.35]) mesh(BOX, intB, x, -0.455, -1.3, 0.5, 0.012, 0.05, cabin);
    for (const x of [-1.42, 0.97]) mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 16), intB, x, -0.58, -0.865, 1, 1, 1, cabin).rotation.x = Math.PI / 2;
    // Square face vents either side of the binnacle, each with a row of slats.
    for (const x of [-0.8, DRIVER_X + 0.5]) {
      mesh(BOX, intB, x, -0.56, -0.868, 0.2, 0.09, 0.01, cabin);
      for (let i = 0; i < 4; i++) mesh(BOX, intA, x, -0.59 + i * 0.02, -0.86, 0.19, 0.006, 0.012, cabin);
    }
    const screen = (texture: THREE.Texture) => new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, color: 0x000000 });
    // Climate controls right beside the radio, stacked: fan, temperature slider, airflow, then the A/C button.
    this.climate.draw();
    this.climate.drawButton(false);
    const climatePanel = mesh(new THREE.PlaneGeometry(0.08, 0.22), screen(this.climate.texture), -0.23, -0.62, -0.86, 1, 1, 1, root);
    // The real parts: knurled fan and airflow knobs, a lever in the temperature slot, and the A/C push button.
    const knobMetal = new THREE.MeshStandardMaterial({ color: 0x2a2624, roughness: 0.7, metalness: 0.3, emissive: 0x0e0c0b });
    const amberLine = new THREE.MeshBasicMaterial({ color: 0xffbe78, toneMapped: false });
    const knobs = [[0.11 - (32 / 264) * 0.22, 0.6], [0.11 - (170 / 264) * 0.22, -0.8]] as const;
    for (const [i, [y, turn]] of knobs.entries()) {
      const knob = new THREE.Group();
      if (i === 0) this.fanKnob = knob;
      knob.position.set(0, y, 0);
      knob.rotation.z = -turn;
      climatePanel.add(knob);
      mesh(new THREE.CylinderGeometry(0.014, 0.015, 0.014, 24), knobMetal, 0, 0, 0.007, 1, 1, 1, knob).rotation.x = Math.PI / 2;
      mesh(BOX, amberLine, 0, 0.007, 0.0145, 0.0015, 0.01, 0.001, knob);
    }
    this.tempLever = mesh(BOX, knobMetal, TEMP_SLOT * (0.62 * 2 - 1), 0.11 - (107 / 264) * 0.22, 0.005, 0.006, 0.016, 0.01, climatePanel);
    // The A/C button, a grey cap like the radio's; taps on it land here.
    const acBody = new THREE.MeshStandardMaterial({ color: 0x24201e, roughness: 0.85 });
    const acFace = new THREE.MeshStandardMaterial({ color: 0x1a1817, roughness: 0.85, emissiveMap: this.climate.buttonTexture, emissive: 0xffffff });
    this.acButton = new THREE.Mesh(CAP_BOX, [acBody, acFace]);
    this.acButton.scale.set(0.06, 0.028, 0.008);
    this.acButton.position.set(0, 0.11 - (240 / 264) * 0.22, 0.004);
    climatePanel.add(this.acButton);
    // The binnacle: a curved hood over the gauges.
    mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.16, 20, 1, true, -Math.PI / 2, Math.PI), intA, DRIVER_X, -0.41, -0.92, 1, 0.42, 1, cabin).rotation.set(Math.PI / 2, 0, 0);
    mesh(BOX, intB, DRIVER_X, -0.42, -0.95, 0.6, 0.2, 0.04, cabin);

    const gaugeScreen = mesh(new THREE.PlaneGeometry(0.5, 0.164), screen(this.gauges.texture), DRIVER_X, -0.4, -0.928, 1, 1, 1, root);
    this.radio = new CarRadio(root, intB);
    // The timer's display, in the radio's housing.
    this.lcdScreen = mesh(PLANE, screen(this.lcd.textures.wide), 0, 0, 0, 1, 1, 1, this.radio.display);

    const navUnit = new THREE.Group();
    // Standing on the dash above the radio, turned a little towards the driver.
    navUnit.position.set(-0.5, -0.38, -0.98);
    navUnit.rotation.set(-0.1, 0.2, 0);
    root.add(navUnit);
    mesh(BOX, intB, 0, 0, -0.012, 0.3, 0.19, 0.02, navUnit);
    const navScreen = mesh(new THREE.PlaneGeometry(0.28, 0.17), screen(this.nav.texture), 0, 0, 0, 1, 1, 1, navUnit);
    this.gaugeScreen = gaugeScreen;
    this.screens = [gaugeScreen, this.lcdScreen, navScreen];

    // A big three-spoke wheel close to the driver, its top just clearing the gauges.
    this.wheel.position.set(DRIVER_X + 0.04, -0.6, -0.52);
    this.wheel.rotation.x = -0.45;
    root.add(this.wheel);
    mesh(new THREE.TorusGeometry(0.235, 0.03, 12, 56), intB, 0, 0, 0, 1, 1, 1, this.wheel);
    for (const a of [Math.PI, 0, -Math.PI / 2]) {
      const spoke = mesh(BOX, intB, Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0, 0.22, 0.05, 0.02, this.wheel);
      spoke.rotation.z = a;
    }
    mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.06, 24), intB, 0, 0, 0.01, 1, 1, 1, this.wheel).rotation.x = Math.PI / 2;
    // Detail: a raised grip ring on the rim, bolts round the hub and a chrome horn badge in the middle.
    const chrome = this.chrome;
    mesh(new THREE.TorusGeometry(0.235, 0.008, 6, 56), intA, 0, 0, 0.026, 1, 1, 1, this.wheel);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.01, 8), chrome, Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0.042, 1, 1, 1, this.wheel).rotation.x = Math.PI / 2;
    }
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 24), chrome, 0, 0, 0.044, 1, 1, 1, this.wheel).rotation.x = Math.PI / 2;
    mesh(new THREE.TorusGeometry(0.042, 0.004, 6, 32), chrome, 0, 0, 0.042, 1, 1, 1, this.wheel);
    mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.25, 16), intA, 0, -0.05, -0.15, 1, 1, 1, this.wheel).rotation.x = Math.PI / 2;

    // Stalks on the column behind the wheel: wipers on the left, indicators on the right.
    for (const side of [-1, 1]) {
      const stalk = new THREE.Group();
      stalk.position.set(DRIVER_X + side * 0.06, -0.5, -0.7);
      root.add(stalk);
      mesh(BOX, intB, side * 0.11, 0, 0, 0.22, 0.022, 0.022, stalk);
      if (side > 0) this.indicatorStalk = stalk;
    }

    this.gearLever = this.addGearLever(root, intA, intB);
    // Each moves or stands as one piece, so its own parts can be drawn together.
    for (const part of [this.gearLever, navUnit]) mergeStatic(part);
    this.addCabin(cabin, intA, intB);
    this.mirror = new Mirror(root, intB);
    this.blinkers = this.addSideMirrors(cabin, root, intB);
    flatten(cabin);
    mergeStatic(cabin);
    // The climate panel's knobs and lever, all but the A/C button, which lights and is tapped.
    // The fan knob and temperature lever move when played with, so they stay apart too.
    const keep = new Set<THREE.Object3D>([this.acButton, this.fanKnob, this.tempLever]);
    const climateParts = new THREE.Group();
    climatePanel.add(climateParts);
    for (const part of [...climatePanel.children]) if (part !== climateParts && !keep.has(part)) climateParts.add(part);
    flatten(climateParts);
    mergeStatic(climateParts);
    // The wheel turns as one piece, so its parts can be drawn together too.
    mergeStatic(this.wheel);

    root.add(this.roof);
    // Deep enough to cover the eye when it sits back from the wheel.
    // Just reaching the pillars' heads, so it never sticks out past the car's sides.
    mesh(BOX, intB, -0.19, 0.52, -0.35, 2.06, 0.07, 1.5, this.roof);
    // The climate panel's printing lights with the ignition, like the radio.
    this.screens.push(this.radio.face, climatePanel);

    // Between the gauges and the radio, just off the dash, so their glow reaches the wheel, console and door.
    this.dashLight.position.set(DRIVER_X - 0.35, -0.38, -0.72);
    this.passLight.position.set(-0.2, 0.55, -0.5);
    this.cabinLight.position.set(-0.35, 0.44, -0.35);
    root.add(this.dashLight, this.passLight, this.cabinLight);

    this.pillars = this.addPillars(root, intA);
    hideFromReflection(root);
  }

  /** The windshield panel, between the pillars from the dash to the roof, showing what's on the glass. */
  addGlass(texture: THREE.Texture): void {
    const [left, right] = PILLAR_ENDS, inset = PILLAR_WIDTH / 2;
    // The pillars rake back far past the glass, so its top corners go where the pillars' heads appear from the
    // driver's seat, along the line of sight to them, at the roof's front edge.
    const eye = new THREE.Vector3(DRIVER_X, 0, GLASS_EYE_BACK);
    const top = (head: THREE.Vector3, x: number) => {
      const at = new THREE.Vector3(x, head.y, head.z), t = (ROOF_EDGE.z - eye.z) / (at.z - eye.z);
      return [eye.x + (at.x - eye.x) * t, ROOF_EDGE.y, ROOF_EDGE.z];
    };
    const corners = [
      [GLASS_X0, left[0].y, left[0].z], [GLASS_X1, right[0].y, right[0].z],
      top(right[1], right[1].x - inset), top(left[1], left[1].x + inset)
    ];
    const glass = new THREE.BufferGeometry();
    glass.setAttribute('position', new THREE.Float32BufferAttribute(corners.flat(), 3));
    glass.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    glass.setIndex([0, 1, 2, 0, 2, 3]);
    // Drawn after the cabin and without depth of its own, so whatever sits in front of the glass covers it.
    const panel = new THREE.Mesh(glass, new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    panel.renderOrder = 1;
    this.root.add(panel);
    hideFromReflection(panel);
    // The side windows, from each pillar back past the eye, between the sill and the roof.
    for (const [foot, head, outward] of PILLAR_ENDS) {
      const x = (p: THREE.Vector3) => p.x + outward * inset;
      const pane = new THREE.BufferGeometry();
      pane.setAttribute('position', new THREE.Float32BufferAttribute([
        x(foot), foot.y, foot.z, x(head), head.y, head.z, x(head), head.y, SIDE_PANE_END, x(foot), foot.y, SIDE_PANE_END
      ], 3));
      pane.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 1, 1, 0], 2));
      pane.setIndex([0, 1, 2, 0, 2, 3]);
      const mesh = new THREE.Mesh(pane, this.sideMist);
      mesh.renderOrder = 1;
      mesh.visible = false;
      this.root.add(mesh);
      hideFromReflection(mesh);
      this.sidePanes.push(mesh);
      const rain = new THREE.Mesh(pane, this.sideRain);
      rain.renderOrder = 1;
      rain.visible = false;
      this.root.add(rain);
      hideFromReflection(rain);
      this.rainPanes.push(rain);
    }
  }

  /** Steams the side windows up with the windshield while the driver settles in, so they don't give the drive away either. */
  setSideMist({ level, dark, fog }: { level: number; dark: number; fog: number }): void {
    // Steamed up while settling in; fogged in patches, like the windshield, when the A/C is off in the wet.
    const fogged = Math.min(1, fog * SIDE_FOG_GAIN), shown = Math.max(level, fogged);
    for (const pane of this.sidePanes) pane.visible = shown > 0.01;
    this.sideMist.opacity = shown;
    const map = level >= fogged ? null : this.sideFog;
    if (map !== this.sideMist.map) {
      this.sideMist.map = map;
      this.sideMist.needsUpdate = true;
    }
    // Steam is a dim film; fog patches are lighter, catching what light there is.
    if (map) this.sideMist.color.setScalar(lerp(0.9, 0.5, dark));
    else this.sideMist.color.setRGB(lerp(0.52, 0.14, dark), lerp(0.55, 0.15, dark), lerp(0.6, 0.18, dark), THREE.SRGBColorSpace);
    this.mirror.setFog(fog);
  }

  /** Rain on the side windows, as heavy as it falls, drifting back faster the quicker the car goes. */
  setSideRain(level: number, speed: number, dt: number): void {
    for (const pane of this.rainPanes) pane.visible = level > 0.01;
    this.sideRain.opacity = Math.min(1, level * 1.4);
    // The texture runs from the pillar back past the eye, so drifting back means sliding it towards the front's side of the texture.
    this.sideRainTexture.offset.x = (this.sideRainTexture.offset.x - speed * dt * SIDE_RAIN_DRIFT + 1) % 1;
  }

  /** Turns the fan knob by a drag, within its stops. */
  turnFan(by: number): void {
    this.fanKnob.rotation.z = THREE.MathUtils.clamp(this.fanKnob.rotation.z - by, -FAN_STOP, FAN_STOP);
  }

  /** Slides the temperature lever along its slot, from blue to red. */
  slideTemp(by: number): void {
    this.tempLever.position.x = THREE.MathUtils.clamp(this.tempLever.position.x + by * this.side, -TEMP_SLOT, TEMP_SLOT);
  }

  /** 1 is the right-hand-drive interior as built; -1 mirrors it for a left-hand-drive car. */
  setSide(side: number): void {
    this.side = side;
    this.root.scale.x = side;
    for (const s of this.screens) s.scale.x = side;
  }

  /** Sits the eye back from the wheel and tilts it down into the car; the interior itself doesn't move in the car. */
  seat(back: number, lookDown: number, yaw: number, drop: number): void {
    // The interior turns against the head, so it stays put in the car while the view moves.
    this.root.quaternion.setFromEuler(this.headTurn.set(-lookDown, yaw, 0, 'YXZ')).invert();
    // The eye sits in front of the wheel, wherever that is across the car.
    this.root.position.set(-DRIVER_X * this.side, drop, -back).applyQuaternion(this.root.quaternion);
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

  /** 0 to 1: how lit the headlamp lenses look. */
  setHeadlamps(level: number): void {
    this.lampGlass.color.setRGB(0.33 + 0.67 * level, 0.31 + 0.64 * level, 0.29 + 0.55 * level);
  }

  /** Lights the A/C button's lamp. */
  setAirCon(on: boolean): void {
    this.climate.drawButton(on);
  }

  setCabinLight(on: boolean): void {
    this.cabinLevel = on ? CABIN_LIGHT : 0;
  }

  /** Mirroring the interior would otherwise turn the wheel the wrong way. */
  steer(bend: number): void {
    // Turned half as far as the road bends, so on gentle curves it sits nearly straight.
    this.wheel.rotation.z = bend * 450 * this.side;
  }

  /** Screens light with the ignition, and at ON the needles sweep their full travel, like a real self-test. */
  setEngine(state: EngineState): void {
    if (state === 'on' && this.engine !== 'cranking' && this.engine !== 'running') this.sweepLeft = SWEEP_SECONDS;
    this.engine = state;
  }

  update(dt: number, speed: number, bend: number, clock: number): void {
    this.mirror.update(dt, speed, bend);
    this.indicatorStalk.rotation.z = this.signal * 0.18;
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
    // Dark brown carpet, set apart from the black trim, with clutch, brake and throttle in the driver's footwell.
    const carpet = new THREE.MeshStandardMaterial({ color: 0x3d2716, roughness: 1 });
    mesh(BOX, carpet, -0.26, -1.06, -0.4, 2.6, 0.04, 2.2, cabin);
    for (const [dx, w] of [[-0.14, 0.1], [0.02, 0.13], [0.2, 0.07]] as const) {
      mesh(BOX, trim, DRIVER_X + dx, -0.9, -0.8, w, 0.16, 0.02, cabin).rotation.x = -0.5;
    }
    // The centre console, which carries the radio, running back between the seats.
    mesh(BOX, trim, -0.4, -0.9, -0.55, 0.36, 0.3, 0.9, cabin);
    mesh(BOX, panel, -0.4, -0.64, 0.02, 0.22, 0.05, 0.36, cabin);
    // On the console, where the driver sees them: a row of switches, two cup holders and the handbrake.
    const metal = this.chrome;
    for (let i = 0; i < 4; i++) mesh(BOX, metal, -0.49 + i * 0.06, -0.745, -0.95, 0.035, 0.012, 0.025, cabin);
    // Two cup holders on the console, right under the radio: dark wells with a raised rim.
    const hole = trim;
    for (const dx of [-0.075, 0.075]) {
      mesh(new THREE.CircleGeometry(0.056, 20), hole, -0.4 + dx, -0.748, -0.78, 1, 1, 1, cabin).rotation.x = -Math.PI / 2;
      mesh(new THREE.TorusGeometry(0.058, 0.007, 6, 24), trim, -0.4 + dx, -0.747, -0.78, 1, 1, 1, cabin).rotation.x = -Math.PI / 2;
    }
    // A slim handbrake: a black lever with a chrome release button at its end.
    mesh(BOX, trim, -0.4, -0.72, -0.6, 0.03, 0.03, 0.2, cabin).rotation.x = 0.2;
    mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 10), metal, -0.4, -0.7, -0.505, 1, 1, 1, cabin).rotation.x = Math.PI / 2;
    // A stitched seam along the console's top and the outline of the armrest's lid.
    mesh(BOX, panel, -0.4, -0.749, -0.55, 0.006, 0.004, 0.8, cabin);
    mesh(BOX, metal, -0.4, -0.612, -0.16, 0.2, 0.004, 0.004, cabin);
    // The passenger's side of the dash: a glovebox with its catch, and an air vent at the end.
    const lid = panel;
    const chrome = this.chrome;
    // The glovebox: a lid in a frame, its chrome catch at the top.
    mesh(BOX, panel, -1.1, -0.68, -0.872, 0.5, 0.2, 0.012, cabin);
    mesh(BOX, lid, -1.1, -0.68, -0.864, 0.46, 0.16, 0.01, cabin);
    mesh(BOX, chrome, -1.1, -0.62, -0.856, 0.09, 0.016, 0.01, cabin);
    // The driver's door card: an armrest and a chrome pull, as on any 80s saloon.
    mesh(BOX, panel, 0.98, -0.62, -0.3, 0.1, 0.06, 0.55, cabin);
    mesh(BOX, chrome, 0.985, -0.52, -0.62, 0.02, 0.035, 0.12, cabin);
    // A leather grab handle on the door card, a loop to pull the door shut by.
    const leather = new THREE.MeshStandardMaterial({ color: 0x2a1610, roughness: 0.7 });
    mesh(new THREE.TorusGeometry(0.07, 0.014, 8, 16, Math.PI), leather, 0.985, -0.45, -0.5, 1, 1, 1, cabin).rotation.set(0, Math.PI / 2, Math.PI);
    // Rubber floor mats in both footwells, ridged across.
    const rubber = trim;
    for (const x of [DRIVER_X + 0.1, -0.9]) {
      mesh(BOX, rubber, x, -1.035, -0.55, 0.75, 0.01, 0.6, cabin);
      for (let i = 0; i < 6; i++) mesh(BOX, rubber, x, -1.028, -0.8 + i * 0.1, 0.7, 0.006, 0.02, cabin);
    }
    // Stitched trim lines across the door card, a round speaker low down and a window winder.
    const stitch = new THREE.MeshStandardMaterial({ color: 0x6b3a35, roughness: 0.9 });
    for (const y of [-0.5, -0.56, -0.7]) mesh(BOX, stitch, 0.995, y, -0.4, 0.006, 0.006, 1.4, cabin);
    mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.015, 24), trim, 0.995, -0.84, -0.75, 1, 1, 1, cabin).rotation.z = Math.PI / 2;
    mesh(new THREE.TorusGeometry(0.078, 0.006, 6, 24), chrome, 0.99, -0.84, -0.75, 1, 1, 1, cabin).rotation.y = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 16), chrome, 0.99, -0.62, -0.05, 1, 1, 1, cabin).rotation.z = Math.PI / 2;
    mesh(BOX, chrome, 0.98, -0.65, -0.05, 0.012, 0.07, 0.014, cabin);
    mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.04, 10), trim, 0.965, -0.685, -0.05, 1, 1, 1, cabin).rotation.z = Math.PI / 2;
  }

  /** A mirror on each door, just beyond the pillar's foot, angled back at the driver, with an indicator at its outer end. */
  private addSideMirrors(cabin: THREE.Group, root: THREE.Group, housing: THREE.Material): [THREE.Mesh, THREE.Mesh] {
    // The same view behind as the rear-view mirror paints, so they work as mirrors.
    const glass = new THREE.MeshBasicMaterial({ map: this.mirror.texture, toneMapped: false });
    // Only the middle of that picture, clear of the rear window's frame, which would look boxy in an oval.
    const mirrorGlass = new THREE.CircleGeometry(1, 28), uv = mirrorGlass.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5 + (uv.getX(i) - 0.5) * 0.55, 0.5 + (uv.getY(i) - 0.5) * 0.5);
    const lit = new THREE.MeshBasicMaterial({ color: 0xffa424, toneMapped: false });
    const lights = PILLAR_ENDS.map(([foot, , outward]) => {
      const x = foot.x + outward * 0.2, y = foot.y + 0.1, z = foot.z + 0.12, yaw = -outward * 0.35;
      // A rounded pod with oval glass, as on 80s door mirrors.
      mesh(new THREE.SphereGeometry(1, 20, 12), housing, x, y, z, 0.16, 0.095, 0.05, cabin).rotation.y = yaw;
      mesh(mirrorGlass, glass, x - outward * 0.005, y, z + 0.051, 0.14, 0.078, 1, cabin).rotation.y = yaw;
      const light = mesh(BOX, lit, x + outward * 0.14 * Math.cos(yaw), y, z - outward * 0.14 * Math.sin(yaw), 0.03, 0.09, 0.085, root);
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
  private addPillars(root: THREE.Group, material: THREE.Material): Outline[] {
    // Double-sided for the sweeps' sake; the pillars and sweeps are then all drawn as one.
    const frameMaterial = (material as THREE.MeshStandardMaterial).clone();
    frameMaterial.side = THREE.DoubleSide;
    const frame = new THREE.Group();
    root.add(frame);
    const outlines = PILLAR_ENDS.map(([a, b, outward]) => {
      const pillar = new THREE.Mesh(BOX, frameMaterial);
      pillar.scale.set(PILLAR_WIDTH, 0.08, a.distanceTo(b));
      pillar.position.copy(a).add(b).multiplyScalar(0.5);
      // lookAt works in world space, so aim it while it has no parent.
      pillar.lookAt(b);
      frame.add(pillar);
      const inner = -outward * PILLAR_WIDTH / 2;
      // The top of the pillar sweeps round into the roof's front edge, rather than meeting it in a corner.
      const from = a.clone().lerp(b, PILLAR_SWEEP_FROM), corner = new THREE.Vector3(b.x + inner, ROOF_EDGE.y, ROOF_EDGE.z);
      const sweep = new THREE.QuadraticBezierCurve3(from, new THREE.Vector3(from.x, corner.y, from.z), corner).getPoints(8);
      const fill = new THREE.BufferGeometry().setFromPoints(sweep.flatMap((p, i) => (i ? [b, p, sweep[i - 1]] : [])));
      // Indexed and with texture coordinates, like the pillar it's merged with.
      const count = fill.attributes.position.count;
      fill.setIndex(Array.from({ length: count }, (_, i) => i));
      fill.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
      fill.computeVertexNormals();
      frame.add(new THREE.Mesh(fill, frameMaterial));
      return {
        object: root,
        points: [
          new THREE.Vector3(a.x + inner, a.y - 0.1, a.z),
          ...sweep,
          new THREE.Vector3(b.x + outward * 3, corner.y + 0.1, corner.z),
          new THREE.Vector3(b.x + outward * 3, b.y + 0.1, b.z),
          new THREE.Vector3(a.x + outward * 3, a.y - 0.1, a.z)
        ]
      };
    });
    mergeStatic(frame);
    return outlines;
  }
}
