import { noiseBuffer, type NoiseKind } from './nodes';

export const CHANNELS = ['music', 'rain', 'engine', 'wipers', 'traffic', 'wind'] as const;
export type Channel = (typeof CHANNELS)[number];
export type Mix = Record<Channel, number>;

/** How quickly a level change is eased in, in seconds. */
const LEVEL_EASE = 0.4;
/** Time constant of the fade as the page closes: a few milliseconds, which is all a closing page gets. */
const CLOSE_FADE = 0.004;

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
  private readonly readyListeners: ((graph: AudioGraph) => void)[] = [];

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
    // Safari's audio session: as playback, iOS keeps the sound going with the screen locked or
    // another app in front, like a music player, so the chime still rings at the end of a phase.
    // It also plays through the ring/silent switch, as music apps do.
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'playback';
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
    // Closing the tab cuts the sound mid-wave, which clicks; a fade as it starts closing ends it at silence.
    addEventListener('pagehide', () => master.gain.setTargetAtTime(0, ctx.currentTime, CLOSE_FADE));
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
