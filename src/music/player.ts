import type { AudioEngine, AudioGraph } from '../audio/engine';
import { Deck, silentWavUrl } from './deck';
import type { GeneratedProvider } from './generated';
import type { JamendoProvider } from './jamendo';
import type { LocalProvider } from './local';
import type { TrackPrefs } from './prefs';
import type { RadioProvider } from './radio';
import { STYLES, type StyleId } from './styles';
import { RateLimited, type MusicProvider, type ProviderId, type Track } from './types';

export type SourceMode = 'tracks' | 'radio' | 'local' | 'mix';

export const SOURCE_MODES: Record<SourceMode, { name: string }> = {
  tracks: { name: 'Tracks' },
  radio: { name: 'Live radio' },
  local: { name: 'Local' },
  mix: { name: 'Mix' }
};

/** Providers to try for each mode, each group a fallback for the one before. */
const PLAN: Record<SourceMode, ProviderId[][]> = {
  tracks: [['jamendo'], ['local'], ['generated']],
  radio: [['radio'], ['generated']],
  local: [['local'], ['generated']],
  mix: [['jamendo', 'local'], ['radio'], ['generated']]
};

const PROVIDER_NAMES: Record<ProviderId, string> = { jamendo: 'Jamendo', radio: 'Live radio', local: 'Local music', generated: 'Generated music' };

const CROSSFADE_SECONDS = 4;
/** A provider that rate-limits us, or keeps failing, is left alone this long. */
const REST_MS = 15 * 60 * 1000;
/** After this many tracks in a row fail, the source is given up for the next fallback. */
const MAX_FAILURES = 4;
const TICK_MS = 100;

export interface Providers {
  jamendo: JamendoProvider;
  radio: RadioProvider;
  local: LocalProvider;
  generated: GeneratedProvider;
}

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused';

/**
 * Plays a style's music from one source mode, merging providers and falling
 * back quietly when they fail. Tracks crossfade; streams play until skipped.
 */
export class MusicPlayer {
  status: PlayerStatus = 'idle';
  /** Everything played this session, for the credits. */
  readonly credits: Track[] = [];
  /** The providers actually in use, after any fallback. */
  using: ProviderId[] = [];
  shuffle = true;

  private decks: [Deck, Deck] | null = null;
  private active = 0;
  private queue: Track[] = [];
  private position = -1;
  private style: StyleId = 'chillhop';
  private mode: SourceMode = 'mix';
  private wanted = false;
  private failures = 0;
  private load = 0;
  private lastTick = 0;
  private readonly resting = new Map<ProviderId, number>();
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly audio: AudioEngine,
    private readonly providers: Providers,
    private readonly prefs: TrackPrefs,
    private readonly notify: (message: string) => void,
    private readonly mixLevel: () => number
  ) {
    audio.onReady(graph => this.attach(graph));
  }

  get current(): Track | null {
    return this.decks?.[this.active].track ?? null;
  }

  get liked(): boolean {
    return this.current ? this.prefs.isLiked(this.current.key) : false;
  }

  onChange(listener: () => void): void {
    this.listeners.add(listener);
  }

  /** Chooses what to play; switching while playing crossfades to the new choice. */
  configure(style: StyleId, mode: SourceMode): void {
    if (style === this.style && mode === this.mode && this.queue.length) return;
    this.style = style;
    this.mode = mode;
    this.queue = [];
    this.position = -1;
    if (this.wanted) void this.advance();
  }

  play(): void {
    this.wanted = true;
    const deck = this.decks?.[this.active];
    if (!deck) return;
    if (deck.track) {
      deck.resume();
      deck.target = 1;
      this.setStatus('playing');
    } else void this.advance();
  }

  pause(): void {
    this.wanted = false;
    const deck = this.decks?.[this.active];
    if (deck) deck.target = 0;
    this.load++;
    this.setStatus(deck?.track ? 'paused' : 'idle');
  }

  toggle(): void {
    if (this.wanted) this.pause();
    else this.play();
  }

  get playing(): boolean {
    return this.wanted;
  }

  next(): void {
    if (this.wanted) void this.advance();
  }

  toggleLike(): void {
    if (this.current) this.prefs.toggleLike(this.current.key);
    this.emit();
  }

  /** Never plays the current track again, and moves on. */
  ban(): void {
    const track = this.current;
    if (!track || track.kind === 'generated') return;
    this.prefs.ban(track.key);
    this.queue = this.queue.filter(t => t.key !== track.key);
    this.position = Math.min(this.position, this.queue.length - 1);
    this.notify(`Won't play "${track.title}" again`);
    this.next();
  }

  private attach(graph: AudioGraph): void {
    const silence = silentWavUrl();
    this.decks = [new Deck(graph, silence), new Deck(graph, silence)];
    for (const deck of this.decks) {
      // Called inside the unlocking gesture, which is what lets them play later on iOS.
      deck.prime();
      deck.onEnded = () => {
        if (deck === this.decks?.[this.active] && this.wanted) void this.advance();
      };
    }
    this.lastTick = performance.now();
    // A timer rather than frames, so music keeps fading and advancing in a background tab.
    setInterval(() => this.tick(), TICK_MS);
    if (this.wanted) void this.advance();
  }

  private tick(): void {
    const now = performance.now(), dt = (now - this.lastTick) / 1000;
    this.lastTick = now;
    if (!this.decks) return;
    for (const deck of this.decks) {
      deck.fade(dt, 1 / CROSSFADE_SECONDS, this.mixLevel(), this.audio.isMuted);
      if (deck.level > 0 || deck.target > 0 || !deck.track) continue;
      // A deck that is still loading is silent too, so only retired or paused ones are touched.
      if (deck.retiring) {
        deck.retiring = false;
        deck.stop();
      } else if (deck === this.decks[this.active] && !this.wanted) deck.pause();
    }
    const deck = this.decks[this.active];
    if (this.wanted && this.status === 'playing' && deck.remaining < CROSSFADE_SECONDS) void this.advance();
  }

  /** Moves to the next track, crossfading from the current one. */
  private async advance(): Promise<void> {
    if (!this.decks) return;
    const load = ++this.load;
    this.setStatus('loading');
    if (this.position + 1 >= this.queue.length) await this.refill();
    if (load !== this.load) return;
    const track = this.queue[++this.position];
    if (!track) {
      this.setStatus('idle');
      return;
    }
    const deck = this.decks[1 - this.active];
    try {
      const url = await this.provider(track.provider).getStream(track);
      await deck.load(track, url);
    } catch {
      if (load !== this.load) return;
      deck.stop();
      this.failures++;
      if (this.failures >= MAX_FAILURES) {
        // This source isn't working; rest it and fall back to the next.
        for (const p of this.using) this.resting.set(p, Date.now() + REST_MS);
        this.queue = [];
        this.position = -1;
        this.failures = 0;
      }
      void this.advance();
      return;
    }
    if (load !== this.load) {
      deck.stop();
      return;
    }
    this.failures = 0;
    this.decks[this.active].target = 0;
    this.decks[this.active].retiring = true;
    this.active = 1 - this.active;
    deck.target = 1;
    if (!this.credits.some(t => t.key === track.key)) this.credits.push(track);
    this.setStatus('playing');
  }

  /** Fills the queue from the first group of providers that has anything, saying so if that's a fallback. */
  private async refill(): Promise<void> {
    const groups = PLAN[this.mode];
    // When the queue runs out, Jamendo can offer another page before we repeat.
    if (this.queue.length && this.using.includes('jamendo')) {
      const more = await this.safely('jamendo', p => (p as JamendoProvider).more(this.style));
      if (more.length) {
        this.queue.push(...this.arrange(more));
        return;
      }
    }
    for (const [i, group] of groups.entries()) {
      const lists = await Promise.all(group.filter(p => (this.resting.get(p) ?? 0) < Date.now()).map(p => this.safely(p, provider => provider.search(this.style))));
      const tracks = lists.flat().filter(t => !this.prefs.isBanned(t.key));
      if (!tracks.length) continue;
      if (i > 0 && !this.sameGroup(group)) this.notify(`${groups[0].map(p => PROVIDER_NAMES[p]).join(' and ')} unavailable. Playing ${PROVIDER_NAMES[group[0]].toLowerCase()}.`);
      this.using = group;
      this.queue = this.arrange(tracks);
      this.position = -1;
      return;
    }
    this.queue = [];
  }

  private sameGroup(group: ProviderId[]): boolean {
    return group.length === this.using.length && group.every(p => this.using.includes(p));
  }

  /** Runs a provider call, treating any failure as no results and resting a provider that rate-limits us. */
  private async safely(id: ProviderId, call: (p: MusicProvider) => Promise<Track[]>): Promise<Track[]> {
    try {
      return await call(this.provider(id));
    } catch (e) {
      if (e instanceof RateLimited) this.resting.set(id, Date.now() + REST_MS);
      return [];
    }
  }

  /** Shuffled, with liked tracks tending to come up sooner. */
  private arrange(tracks: Track[]): Track[] {
    if (!this.shuffle) return tracks;
    return tracks
      .map(t => ({ t, k: Math.random() ** (this.prefs.isLiked(t.key) ? 0.4 : 1) }))
      .sort((a, b) => b.k - a.k)
      .map(x => x.t);
  }

  private provider(id: ProviderId): MusicProvider {
    return this.providers[id];
  }

  private setStatus(status: PlayerStatus): void {
    this.status = status;
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  /** For the now-playing line: the style, and where the music is coming from. */
  describe(): string {
    return `${STYLES[this.style].name} · ${SOURCE_MODES[this.mode].name}`;
  }
}
