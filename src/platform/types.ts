import type { SessionRecord } from '../stats/sessions';

/** Everything that differs between the browser and a future Capacitor shell. */
export interface Platform {
  storage: KeyValueStorage;
  keepAwake: KeepAwake;
  sessions: SessionStore;
  /** Hands a file to the user: a download here, the share sheet in a native shell. */
  saveFile(name: string, text: string): void;
  /**
   * Called as sound first starts: asks for it to carry on with the screen locked, like a music
   * player. Safari's audio session here; the Audio background mode in a native shell.
   */
  playInBackground(): void;
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

/** Completed focus sessions; a native shell could keep these in SQLite instead. */
export interface SessionStore {
  /** Oldest first. */
  all(): Promise<SessionRecord[]>;
  /** Adds sessions, replacing any with the same end time. */
  put(records: readonly SessionRecord[]): Promise<void>;
  clear(): Promise<void>;
}
