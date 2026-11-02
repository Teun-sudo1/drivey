import type { EngineState } from '../app/engine';
import { rand } from '../lib/math';
import type { RouteId } from '../routes';
import type { Weather } from '../weather/tables';
import type { AudioEngine, AudioGraph, Channel, Mix } from './engine';
import { filter, loop } from './nodes';

export type AmbientChannel = Exclude<Channel, 'music'>;

/** How busy each route sounds. */
const TRAFFIC_BY_ROUTE: Record<RouteId, number> = { city: 1, highway: 0.8, coast: 0.45, country: 0.25 };
const TOP_SPEED = 28;
const SWELL_EVERY = 1.5;
/** The starter's chug: one beat per compression stroke. */
const STARTER_BEAT_HZ = 9;

export interface AmbienceFrame {
  dt: number;
  weather: Weather;
  route: RouteId;
  speed: number;
  engine: EngineState;
  /** Levels the user set on the mixer, 0 to 1. */
  mix: Mix;
  /** Whether the scene shapes those levels, as the weather and road change. */
  follow: boolean;
  /** 0 in the open to 1 in a tunnel, where nothing patters on the glass. */
  shelter: number;
}

/** How loud the scene makes each ambient channel, before the user's mix. */
export function sceneLevels(f: Omit<AmbienceFrame, 'dt' | 'mix' | 'follow'>): Record<AmbientChannel, number> {
  const running = f.engine === 'running' ? 1 : 0;
  const w = f.weather;
  return {
    rain: (w.rain * 0.9 + w.snow * 0.1) * (1 - f.shelter),
    engine: running * (0.4 + (0.6 * f.speed) / TOP_SPEED),
    wipers: w.wipe > 0 && f.engine !== 'off' && f.engine !== 'acc' ? 1 : 0,
    traffic: TRAFFIC_BY_ROUTE[f.route],
    wind: (w.snow > 0 ? 1 : w.fog > 0.02 ? 0.6 : 0.45) * (f.route === 'coast' ? 1.4 : 1) * 0.6
  };
}

/**
 * The continuous sounds around the car, all generated from noise and
 * oscillators so the app needs no audio files.
 */
export class Ambience {
  private engineOscillators: [OscillatorNode, number][] = [];
  private starter: GainNode | null = null;
  private hum: GainNode | null = null;
  private trafficSwell: GainNode | null = null;
  private swellTimer = 0;
  private lastEngine: EngineState = 'off';

  constructor(private readonly audio: AudioEngine) {
    audio.onReady(graph => this.build(graph));
  }

  update(f: AmbienceFrame): void {
    const graph = this.audio.graph;
    if (!graph) return;
    const scene = sceneLevels(f);
    for (const k of Object.keys(scene) as AmbientChannel[]) this.audio.setLevel(k, f.mix[k] * (f.follow ? scene[k] : k === 'engine' ? (f.engine === 'running' ? 1 : 0) : 1));
    // The starter belongs to the engine channel, but sounds before the engine runs.
    if (f.engine === 'cranking') this.audio.setLevel('engine', f.mix.engine);
    this.audio.setLevel('music', f.mix.music);

    const t = graph.ctx.currentTime;
    for (const [o, ratio] of this.engineOscillators) o.frequency.setTargetAtTime((28 + f.speed * 1.15) * ratio, t, 0.5);
    this.starter?.gain.setTargetAtTime(f.engine === 'cranking' ? 0.9 : 0, t, 0.03);
    if (f.engine === 'running' && this.lastEngine === 'cranking') this.catchRev(graph);
    this.lastEngine = f.engine;

    this.swellTimer += f.dt;
    if (this.swellTimer > SWELL_EVERY && this.trafficSwell) {
      this.swellTimer = 0;
      this.trafficSwell.gain.setTargetAtTime(rand(0.2, 1), t, 1.2);
    }
  }

  private build(graph: AudioGraph): void {
    const { ctx, channels: ch, noise } = graph;
    // Rain on glass: a hiss with a softer rumble under it.
    loop(ctx, noise.white, [filter(ctx, 'highpass', 700), filter(ctx, 'lowpass', 7000)], ch.rain, 0.55);
    loop(ctx, noise.brown, [filter(ctx, 'lowpass', 900)], ch.rain, 0.35);

    // Engine: detuned saws and a sub, under road rumble.
    this.hum = ctx.createGain();
    this.hum.gain.value = 1;
    this.hum.connect(ch.engine);
    const lowpass = filter(ctx, 'lowpass', 170, 2.5);
    const body = ctx.createGain();
    body.gain.value = 0.35;
    lowpass.connect(body);
    body.connect(this.hum);
    for (const [type, ratio] of [['sawtooth', 1], ['sawtooth', 1.5], ['sine', 0.5]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = 40 * ratio;
      o.connect(lowpass);
      o.start();
      this.engineOscillators.push([o, ratio]);
    }
    loop(ctx, noise.brown, [filter(ctx, 'lowpass', 260)], this.hum, 1.1);

    // Starter motor: a whirr that chugs with each compression stroke.
    this.starter = ctx.createGain();
    this.starter.gain.value = 0;
    this.starter.connect(ch.engine);
    const chug = ctx.createGain();
    chug.gain.value = 0.5;
    chug.connect(this.starter);
    const beat = ctx.createOscillator(), depth = ctx.createGain();
    beat.frequency.value = STARTER_BEAT_HZ;
    depth.gain.value = 0.45;
    beat.connect(depth);
    depth.connect(chug.gain);
    beat.start();
    loop(ctx, noise.white, [filter(ctx, 'bandpass', 380, 1.4)], chug, 1.6);

    // Traffic and the city: low swells that come and go.
    this.trafficSwell = ctx.createGain();
    this.trafficSwell.gain.value = 0.4;
    this.trafficSwell.connect(ch.traffic);
    loop(ctx, noise.brown, [filter(ctx, 'lowpass', 700)], this.trafficSwell, 1);

    // Wind: band-passed noise whose pitch drifts.
    const band = filter(ctx, 'bandpass', 500, 0.8);
    loop(ctx, noise.white, [band], ch.wind, 0.5);
    const drift = ctx.createOscillator(), driftDepth = ctx.createGain();
    drift.frequency.value = 0.07;
    driftDepth.gain.value = 260;
    drift.connect(driftDepth);
    driftDepth.connect(band.frequency);
    drift.start();
  }

  /** The engine catching: a quick rev that settles to idle. */
  private catchRev(graph: AudioGraph): void {
    const t = graph.ctx.currentTime;
    for (const [o, ratio] of this.engineOscillators) {
      o.frequency.cancelScheduledValues(t);
      o.frequency.setValueAtTime(30 * ratio, t);
      o.frequency.linearRampToValueAtTime(70 * ratio, t + 0.35);
      o.frequency.setTargetAtTime(28 * ratio, t + 0.35, 0.4);
    }
    this.hum?.gain.setValueAtTime(1.8, t);
    this.hum?.gain.setTargetAtTime(1, t + 0.3, 0.3);
  }
}
