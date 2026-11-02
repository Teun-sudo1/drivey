import type { AudioEngine } from './audioEngine';
import { filter, midiToHz } from './nodes';

/** One-off sounds: the wiper blade, the phase chime, the key clicking between positions and the timer's buttons. */
export class Effects {
  constructor(private readonly audio: AudioEngine) {}

  /** A blade sweeping across wet glass, ending in a soft thump as it turns. */
  swish(): void {
    const graph = this.audio.graph;
    if (!graph) return;
    const { ctx, channels, noise } = graph;
    const t = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = noise.white;
    const band = filter(ctx, 'bandpass', 1400, 1.2), g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    band.frequency.setValueAtTime(900, t);
    band.frequency.linearRampToValueAtTime(1800, t + 0.35);
    source.connect(band);
    band.connect(g);
    g.connect(channels.wipers);
    source.start(t, Math.random());
    source.stop(t + 0.5);
    const thump = ctx.createOscillator(), tg = ctx.createGain();
    thump.frequency.value = 70;
    tg.gain.setValueAtTime(0.0001, t);
    tg.gain.setValueAtTime(0.25, t + 0.38);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    thump.connect(tg);
    tg.connect(channels.wipers);
    thump.start(t + 0.38);
    thump.stop(t + 0.55);
  }

  /**
   * Three rising bell notes at the end of a phase, `delay` seconds from now. Scheduled on
   * the audio clock, which keeps time in a background tab where timers are slowed down.
   * Returns a way to call it off, or null when there's no sound yet.
   */
  chime(delay = 0): (() => void) | null {
    const graph = this.audio.graph;
    if (!graph) return null;
    const { ctx, master } = graph;
    const t = ctx.currentTime + Math.max(0, delay);
    const notes = [76, 83, 88].map((note, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), at = t + i * 0.18;
      o.type = 'sine';
      o.frequency.value = midiToHz(note);
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.18, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, at + 2.2);
      o.connect(g);
      g.connect(master);
      o.start(at);
      o.stop(at + 2.3);
      return o;
    });
    return () => notes.forEach(o => o.stop());
  }

  /**
   * A dashboard switch: a soft plastic click with a little body under it. Start sounds
   * a touch higher than the others, so starting and stopping are told apart by ear.
   */
  press(start: boolean): void {
    const graph = this.audio.graph;
    if (!graph) return;
    const { ctx, master, noise } = graph;
    const t = ctx.currentTime;
    const source = ctx.createBufferSource(), g = ctx.createGain();
    source.buffer = noise.white;
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
    source.connect(filter(ctx, 'bandpass', start ? 2600 : 1900, 1.5)).connect(g);
    g.connect(master);
    source.start(t, Math.random());
    source.stop(t + 0.03);
    const body = ctx.createOscillator(), bg = ctx.createGain();
    body.frequency.setValueAtTime(start ? 520 : 380, t);
    body.frequency.exponentialRampToValueAtTime(start ? 300 : 220, t + 0.05);
    bg.gain.setValueAtTime(0.12, t);
    bg.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    body.connect(bg);
    bg.connect(master);
    body.start(t);
    body.stop(t + 0.08);
  }

  /** The key's detent clicking as it moves to another position. */
  click(): void {
    const graph = this.audio.graph;
    if (!graph) return;
    const { ctx, master, noise } = graph;
    const t = ctx.currentTime;
    const source = ctx.createBufferSource(), g = ctx.createGain();
    source.buffer = noise.white;
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    source.connect(filter(ctx, 'highpass', 2500)).connect(g);
    g.connect(master);
    source.start(t, Math.random());
    source.stop(t + 0.04);
  }
}
