import type { KeyValueStorage } from '../platform/types';

const STORAGE_KEY = 'nd.music';

interface Stored {
  liked: string[];
  never: string[];
}

/** Liked and banned tracks, by track key, kept across visits. */
export class TrackPrefs {
  private constructor(private readonly storage: KeyValueStorage, private readonly liked: Set<string>, private readonly never: Set<string>) {}

  static async load(storage: KeyValueStorage): Promise<TrackPrefs> {
    let stored: Partial<Stored> = {};
    try {
      stored = JSON.parse((await storage.get(STORAGE_KEY)) ?? '{}') as Partial<Stored>;
    } catch {
      // Unreadable prefs start empty.
    }
    const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    return new TrackPrefs(storage, new Set(strings(stored.liked)), new Set(strings(stored.never)));
  }

  isLiked(key: string): boolean {
    return this.liked.has(key);
  }

  isBanned(key: string): boolean {
    return this.never.has(key);
  }

  toggleLike(key: string): boolean {
    if (this.liked.has(key)) this.liked.delete(key);
    else this.liked.add(key);
    this.save();
    return this.liked.has(key);
  }

  ban(key: string): void {
    this.never.add(key);
    this.liked.delete(key);
    this.save();
  }

  private save(): void {
    void this.storage.set(STORAGE_KEY, JSON.stringify({ liked: [...this.liked], never: [...this.never] } satisfies Stored));
  }
}
