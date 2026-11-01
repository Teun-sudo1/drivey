import * as THREE from 'three';
import { damp, lerp } from '../lib/math';
import type { Backdrop } from '../scene/backdrop';
import type { Cockpit } from '../scene/cockpit/cockpit';
import type { SceneLights } from '../scene/lights';
import { LAMP_KINDS, MATERIALS, SIGN_MATERIALS, WINDOW_MATERIALS } from '../scene/materials';
import type { PostFx } from '../scene/postfx';
import type { Stage } from '../scene/stage';
import { TIMES_OF_DAY, WEATHERS, type TimeOfDayId, type WeatherId } from './tables';

const BLEND_RATE = 1.1;
const COLOR_KEYS = ['top', 'bot', 'fogC', 'sunCol'] as const;
const NUMBER_KEYS = ['fogD', 'hemi', 'sun', 'win', 'lamp', 'head', 'wet', 'exp', 'bloom', 'star', 'over'] as const;

type EnvState = Record<(typeof COLOR_KEYS)[number], THREE.Color> & Record<(typeof NUMBER_KEYS)[number], number>;

function targetState(tod: TimeOfDayId, weather: WeatherId): EnvState {
  const t = TIMES_OF_DAY[tod], w = WEATHERS[weather], over = new THREE.Color(t.over);
  return {
    top: new THREE.Color(t.top).lerp(over, w.over),
    bot: new THREE.Color(t.bot).lerp(over, w.over * 0.8),
    fogC: new THREE.Color(t.fog).lerp(over, w.over * 0.5),
    sunCol: new THREE.Color(t.sunCol),
    fogD: w.fog,
    hemi: t.hemi * w.dim,
    sun: t.sun * w.dim * (1 - w.over * 0.6),
    win: t.win,
    lamp: t.lamp,
    head: t.head,
    wet: w.wet,
    exp: t.exp,
    bloom: t.bloom,
    star: t.star * Math.pow(1 - w.over, 2),
    over: w.over
  };
}

const ROAD_DRY = new THREE.Color(0x2a2b30);
const ROAD_WET = new THREE.Color(0x111216);

/** Eases the whole scene towards the selected time of day and weather. */
export class Environment {
  private state: EnvState | null = null;

  constructor(
    private readonly stage: Stage,
    private readonly lights: SceneLights,
    private readonly postfx: PostFx,
    private readonly cockpit: Cockpit,
    private readonly backdrop: Backdrop
  ) {}

  get lampLevel(): number {
    return this.state?.lamp ?? 0;
  }

  update(dt: number, tod: TimeOfDayId, weather: WeatherId): void {
    const target = targetState(tod, weather);
    if (!this.state) {
      this.state = target;
      this.apply(target);
      return;
    }
    const k = damp(BLEND_RATE, dt);
    let moving = false;
    for (const key of COLOR_KEYS) {
      const c = this.state[key], t = target[key];
      if (Math.abs(c.r - t.r) + Math.abs(c.g - t.g) + Math.abs(c.b - t.b) > 1e-3) moving = true;
      c.lerp(t, k);
    }
    for (const key of NUMBER_KEYS) {
      if (Math.abs(this.state[key] - target[key]) > 1e-4) moving = true;
      this.state[key] = lerp(this.state[key], target[key], k);
    }
    if (moving) this.apply(this.state);
  }

  private apply(env: EnvState): void {
    const { stage, lights, cockpit } = this;
    stage.drawSky(env.top, env.bot);
    stage.fog.color.copy(env.fogC);
    stage.fog.density = env.fogD;
    stage.renderer.toneMappingExposure = env.exp;
    this.postfx.bloomStrength = env.bloom;
    lights.hemi.intensity = env.hemi;
    lights.sun.intensity = env.sun;
    lights.sun.color.copy(env.sunCol);
    lights.headlights.intensity = 170 * env.head + 30 * env.over * (1 - env.head);
    cockpit.dashLight.intensity = 0.03 + 0.1 * env.lamp;
    cockpit.mirror.setLight(env.top, env.bot, env.lamp, env.head);
    for (const m of WINDOW_MATERIALS) m.emissiveIntensity = env.win;
    for (const m of SIGN_MATERIALS) m.emissiveIntensity = 0.05 + 0.3 * env.lamp;
    MATERIALS.under.color.setRGB(1, 0.85, 0.63).multiplyScalar(0.15 + 1.1 * env.lamp);
    for (const m of LAMP_KINDS.values()) {
      m.head.color.copy(m.base).multiplyScalar(0.15 + 2.85 * env.lamp);
      m.glow.opacity = env.lamp * 0.9;
      m.pool.opacity = env.lamp * (0.2 + 0.18 * env.wet);
      m.streak.opacity = env.lamp * env.wet * 0.5;
    }
    MATERIALS.road.color.copy(ROAD_DRY).lerp(ROAD_WET, env.wet);
    MATERIALS.road.roughness = lerp(0.92, 0.5, env.wet);
    this.backdrop.applyEnvironment(env.fogC, env.fogD, env.win, env.star);
  }
}
