import { noiseBuffer, type NoiseKind } from './nodes';

export const CHANNELS = ['music', 'rain', 'engine', 'wipers', 'traffic', 'wind'] as const;
export type Channel = (typeof CHANNELS)[number];
export type Mix = Record<Channel, number>;

/** How quickly a level change is eased in, in seconds. */
const LEVEL_EASE = 0.4;
/** Time constant of the fade as the page closes: silent within about 50 ms. */
const CLOSE_FADE = 0.01;
/** A page that hasn't closed this long after it started to is staying open. */
const STILL_OPEN_MS = 1500;

export interface AudioGraph {
  readonly ctx: AudioContext;
  /** Everything ends up here; muting closes it. */
  readonly master: GainNode;
  readonly channels: Record<Channel, GainNode>;
  readonly noise: Record<NoiseKind, AudioBuffer>;
}

/**
 * Owns the AudioContext. Browsers only allow sound after a user gesture, so
 * nothing exists until `unlock` is called from one; listeners then build their
 * part of the graph.
 */
export class AudioEngine {
  graph: AudioGraph | null = null;
  private muted = false;
  private restoreTimer = 0;
  private readonly readyListeners: ((graph: AudioGraph) => void)[] = [];

  /** `beforeStart` runs once, inside the first gesture, just before the context is made. */
  constructor(private readonly beforeStart: () => void) {}

  get isMuted(): boolean {
    return this.muted;
  }

  /** Must run inside a user gesture handler, which is what lets the context start. */
  unlock(): void {
    if (this.graph) {
      if (this.graph.ctx.state === 'suspended') void this.graph.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    // So the chime still rings at the end of a phase with the screen locked.
    this.beforeStart();
    const ctx = new Ctx();
    void ctx.resume();
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    master.connect(comp);
    comp.connect(ctx.destination);
    const channels = Object.fromEntries(CHANNELS.map(name => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(master);
      return [name, g];
    })) as Record<Channel, GainNode>;
    const noise = { white: noiseBuffer(ctx, 'white'), brown: noiseBuffer(ctx, 'brown'), crackle: noiseBuffer(ctx, 'crackle') };
    this.graph = { ctx, master, channels, noise };
    // Closing the tab cuts the sound mid-wave, which clicks. The fade starts at beforeunload, the
    // earliest sign of closing, so there's time for it; pagehide catches closes that skip it.
    const fadeOut = (): void => {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0, ctx.currentTime, CLOSE_FADE);
      // Still here a moment later, so it wasn't closing after all (a download link, say).
      clearTimeout(this.restoreTimer);
      this.restoreTimer = window.setTimeout(() => this.setMuted(this.muted), STILL_OPEN_MS);
    };
    addEventListener('beforeunload', fadeOut);
    addEventListener('pagehide', fadeOut);
    // Coming back from the browser's back-forward cache.
    addEventListener('pageshow', e => {
      if (e.persisted) this.setMuted(this.muted);
    });
    for (const listener of this.readyListeners) listener(this.graph);
  }

  /** Runs once the graph exists, straight away if it already does. */
  onReady(listener: (graph: AudioGraph) => void): void {
    if (this.graph) listener(this.graph);
    else this.readyListeners.push(listener);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.graph) this.graph.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.graph.ctx.currentTime, 0.05);
  }

  /** Eases a channel towards a level. */
  setLevel(channel: Channel, level: number): void {
    if (!this.graph) return;
    this.graph.channels[channel].gain.setTargetAtTime(level, this.graph.ctx.currentTime, LEVEL_EASE);
  }
}
