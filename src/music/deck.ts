import type { AudioGraph } from '../audio/engine';
import { GeneratedMusic } from '../audio/generatedMusic';
import type { Track } from './types';

/** How long a source may take to start before it counts as dead. */
const LOAD_TIMEOUT_MS = 15000;

/** A tiny silent WAV, played on each element during the unlocking gesture so later plays are allowed. */
export function silentWavUrl(): string {
  const samples = 64, buffer = new ArrayBuffer(44 + samples * 2), v = new DataView(buffer);
  const text = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  v.setUint32(4, 36 + samples * 2, true);
  text(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 16000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, 'data');
  v.setUint32(40, samples * 2, true);
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

function startPlaying(el: HTMLAudioElement, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (ok: boolean) => {
      clearTimeout(timer);
      el.removeEventListener('playing', onPlaying);
      el.removeEventListener('error', onError);
      if (ok) resolve();
      else reject(new Error(`Could not play ${url}`));
    };
    const onPlaying = () => done(true);
    const onError = () => done(false);
    const timer = setTimeout(() => done(false), LOAD_TIMEOUT_MS);
    el.addEventListener('playing', onPlaying);
    el.addEventListener('error', onError);
    el.src = url;
    el.play().catch(() => done(false));
  });
}

/**
 * One source of music with its own fader, so two decks can crossfade. Audio
 * goes through Web Audio when the server allows it (CORS); otherwise the
 * element plays directly and its volume is set by hand, which iOS ignores.
 */
export class Deck {
  track: Track | null = null;
  /** How the current track is playing, if at all. */
  mode: 'none' | 'routed' | 'direct' | 'generated' = 'none';
  /** The fader position, 0 to 1, eased towards `target`. */
  level = 0;
  target = 0;
  /** Set when faded out to make way for the other deck; it stops once silent. */
  retiring = false;
  onEnded: () => void = () => {};

  private readonly fader: GainNode;
  private readonly routed = new Audio();
  private readonly direct = new Audio();
  private generated: GeneratedMusic | null = null;

  constructor(private readonly graph: AudioGraph, private readonly silence: string) {
    this.fader = graph.ctx.createGain();
    this.fader.gain.value = 0;
    this.fader.connect(graph.channels.music);
    this.routed.crossOrigin = 'anonymous';
    graph.ctx.createMediaElementSource(this.routed).connect(this.fader);
    for (const el of [this.routed, this.direct]) {
      el.preload = 'auto';
      el.addEventListener('ended', () => {
        if (this.mode !== 'none' && el === this.element) this.onEnded();
      });
    }
  }

  /** Called from a user gesture: iOS only lets an element play later if it has played in one. */
  prime(): void {
    for (const el of [this.routed, this.direct]) {
      el.src = this.silence;
      void el.play().then(() => el.pause()).catch(() => undefined);
    }
  }

  /** Starts a track silently; fade it in by setting `target`. Rejects if it can't be played at all. */
  async load(track: Track, url: string): Promise<void> {
    this.stop();
    this.retiring = false;
    this.track = track;
    if (track.kind === 'generated') {
      this.generated ??= new GeneratedMusic(this.graph, this.fader);
      this.generated.start(track.style);
      this.mode = 'generated';
      return;
    }
    try {
      await startPlaying(this.routed, url);
      this.mode = 'routed';
    } catch {
      // Most often a server without CORS headers; it may still play outside Web Audio.
      this.routed.removeAttribute('src');
      this.routed.load();
      await startPlaying(this.direct, url);
      this.mode = 'direct';
    }
  }

  /** Seconds left of a finite track; Infinity for streams and generated music. */
  get remaining(): number {
    const el = this.element;
    if (!el || this.track?.kind !== 'track' || !Number.isFinite(el.duration)) return Infinity;
    return el.duration - el.currentTime;
  }

  get paused(): boolean {
    if (this.mode === 'generated') return !this.generated?.playing;
    return this.element?.paused ?? true;
  }

  pause(): void {
    this.element?.pause();
    this.generated?.stop();
  }

  resume(): void {
    if (this.mode === 'generated' && this.track) this.generated?.start(this.track.style);
    else void this.element?.play().catch(() => undefined);
  }

  stop(): void {
    this.pause();
    for (const el of [this.routed, this.direct]) {
      if (!el.getAttribute('src')) continue;
      el.removeAttribute('src');
      el.load();
    }
    this.mode = 'none';
    this.track = null;
  }

  /** Moves the fader towards its target; `rate` is fader units per second. */
  fade(dt: number, rate: number, musicLevel: number, muted: boolean): void {
    const step = rate * dt;
    this.level += Math.max(-step, Math.min(step, this.target - this.level));
    this.fader.gain.value = this.level;
    // Outside Web Audio, the channel level and mute have to be applied here.
    this.direct.volume = Math.min(1, this.level * (muted ? 0 : musicLevel));
  }

  private get element(): HTMLAudioElement | null {
    return this.mode === 'routed' ? this.routed : this.mode === 'direct' ? this.direct : null;
  }
}
