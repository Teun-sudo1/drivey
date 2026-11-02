import type { KeyValueStorage } from '../platform/types';

/** Stored values carry their age, so stale ones are refetched. */
interface Entry<T> {
  at: number;
  value: T;
}

export class TimedCache {
  constructor(private readonly store: KeyValueStorage, private readonly ttlMs: number) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.store.get(key);
      if (!raw) return null;
      const entry = JSON.parse(raw) as Entry<T>;
      return Date.now() - entry.at < this.ttlMs ? entry.value : null;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.store.set(key, JSON.stringify({ at: Date.now(), value } satisfies Entry<T>));
  }

  /** Returns the cached value, or loads, caches and returns a fresh one. */
  async through<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = await this.get<T>(key);
    if (hit !== null) return hit;
    const value = await load();
    await this.set(key, value);
    return value;
  }
}
