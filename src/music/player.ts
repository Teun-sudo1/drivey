import type { AudioEngine, AudioGraph } from '../audio/audioEngine';
import { GeneratedMusic } from './generator';
import type { StyleId } from './styles';

const CROSSFADE_SECONDS = 4;
/** How quickly music fades when paused or resumed. */
const PAUSE_FADE_SECONDS = 0.6;
/** Variations move the key by up to this many semitones either way. */
const MAX_TRANSPOSE = 3;

/** One generated piece with its own fader, so two can crossfade. */
interface Deck {
  music: GeneratedMusic;
  fader: GainNode;
}

/**
 * Plays lofi beats generated live in the browser. Changing style, or asking
 * for a new variation in another key, crossfades from what is playing.
 */
export class MusicPlayer {
  /** Counts up with each new variation, for the now-playing line. */
  variation = 1;
  style: StyleId = 'chillhop';

  private decks: [Deck, Deck] | null = null;
  private active = 0;
  private transpose = 0;
  private wanted = false;
  private readonly stopTimers = [0, 0];
  private readonly listeners = new Set<() => void>();

  constructor(audio: AudioEngine) {
    audio.onReady(graph => this.attach(graph));
  }

  get playing(): boolean {
    return this.wanted;
  }

  onChange(listener: () => void): void {
    this.listeners.add(listener);
  }

  setStyle(style: StyleId): void {
    if (style === this.style) return;
    this.style = style;
    this.variation = 1;
    this.transpose = 0;
    if (this.wanted) this.crossfade();
    this.emit();
  }

  play(): void {
    if (this.wanted) return;
    this.wanted = true;
    this.start(this.active, PAUSE_FADE_SECONDS);
    this.emit();
  }

  pause(): void {
    if (!this.wanted) return;
    this.wanted = false;
    this.fadeOut(this.active, PAUSE_FADE_SECONDS);
    this.emit();
  }

  /** A fresh take on the same style, in a different key. */
  next(): void {
    let transpose = this.transpose;
    while (transpose === this.transpose) transpose = Math.round((Math.random() * 2 - 1) * MAX_TRANSPOSE);
    this.transpose = transpose;
    this.variation++;
    if (this.wanted) this.crossfade();
    this.emit();
  }

  private attach(graph: AudioGraph): void {
    const deck = (): Deck => {
      const fader = graph.ctx.createGain();
      fader.gain.value = 0;
      fader.connect(graph.channels.music);
      return { music: new GeneratedMusic(graph, fader), fader };
    };
    this.decks = [deck(), deck()];
    if (this.wanted) this.start(this.active, PAUSE_FADE_SECONDS);
  }

  private crossfade(): void {
    this.fadeOut(this.active, CROSSFADE_SECONDS);
    this.active = 1 - this.active;
    this.start(this.active, CROSSFADE_SECONDS);
  }

  private start(i: number, seconds: number): void {
    const deck = this.decks?.[i];
    if (!deck) return;
    clearTimeout(this.stopTimers[i]);
    deck.music.start(this.style, this.transpose);
    const t = deck.fader.context.currentTime;
    deck.fader.gain.cancelScheduledValues(t);
    deck.fader.gain.setValueAtTime(0, t);
    deck.fader.gain.linearRampToValueAtTime(1, t + seconds);
  }

  /** Fades a deck out, then stops its sequencer so it costs nothing while silent. */
  private fadeOut(i: number, seconds: number): void {
    const deck = this.decks?.[i];
    if (!deck) return;
    const t = deck.fader.context.currentTime;
    deck.fader.gain.cancelScheduledValues(t);
    deck.fader.gain.setValueAtTime(deck.fader.gain.value, t);
    deck.fader.gain.linearRampToValueAtTime(0, t + seconds);
    clearTimeout(this.stopTimers[i]);
    this.stopTimers[i] = window.setTimeout(() => deck.music.stop(), seconds * 1000 + 200);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
