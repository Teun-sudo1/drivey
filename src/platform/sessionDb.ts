import type { SessionRecord } from '../stats/sessions';
import type { SessionStore } from './types';

const DB = 'drivey';
const STORE = 'sessions';

const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'endedAt' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Kept in memory instead when the browser refuses IndexedDB, e.g. some private modes. */
function memoryStore(): SessionStore {
  const byEnd = new Map<number, SessionRecord>();
  return {
    async all() {
      return [...byEnd.values()].sort((a, b) => a.endedAt - b.endedAt);
    },
    async put(records) {
      for (const r of records) byEnd.set(r.endedAt, r);
    },
    async clear() {
      byEnd.clear();
    }
  };
}

export function createSessionDb(): SessionStore {
  const db = open();
  const fallback = memoryStore();
  const store = async (): Promise<IDBDatabase | null> => db.catch(() => null);
  return {
    async all() {
      const d = await store();
      if (!d) return fallback.all();
      const req = d.transaction(STORE).objectStore(STORE).getAll();
      // Keyed by end time, so this comes back oldest first.
      return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result as SessionRecord[]);
        req.onerror = () => reject(req.error);
      });
    },
    async put(records) {
      const d = await store();
      if (!d) return fallback.put(records);
      const tx = d.transaction(STORE, 'readwrite');
      for (const r of records) tx.objectStore(STORE).put(r);
      return done(tx);
    },
    async clear() {
      const d = await store();
      if (!d) return fallback.clear();
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      return done(tx);
    }
  };
}
