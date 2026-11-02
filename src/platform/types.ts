/** Everything that differs between the browser and a future Capacitor shell. */
export interface Platform {
  storage: KeyValueStorage;
  /** Larger, disposable data such as API responses; may be emptied at any time. */
  cache: KeyValueStorage;
  keepAwake: KeepAwake;
}

/** Async because native key-value stores (Capacitor Preferences) are. */
export interface KeyValueStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export interface KeepAwake {
  /** Idempotent: safe to call with the same value repeatedly. */
  set(on: boolean): void;
}
