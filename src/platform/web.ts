import type { KeepAwake, KeyValueStorage, Platform } from './types';

const storage: KeyValueStorage = {
  async get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Private mode or full quota: settings just won't persist.
    }
  }
};

/** A key-value store in IndexedDB, which holds far more than localStorage. */
function createIndexedDbCache(): KeyValueStorage {
  const STORE = 'kv';
  let opened: Promise<IDBDatabase | null> | null = null;
  const open = (): Promise<IDBDatabase | null> => {
    opened ??= new Promise(resolve => {
      try {
        const req = indexedDB.open('drivey-cache', 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return opened;
  };
  const run = async <T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> => {
    const db = await open();
    if (!db) return null;
    return new Promise(resolve => {
      const req = op(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  };
  return {
    async get(key) {
      const v = await run<unknown>('readonly', s => s.get(key));
      return typeof v === 'string' ? v : null;
    },
    async set(key, value) {
      await run('readwrite', s => s.put(value, key));
    }
  };
}

function createWakeLock(): KeepAwake {
  let wanted = false;
  let lock: WakeLockSentinel | null = null;
  let requesting = false;

  async function sync(): Promise<void> {
    if (!wanted) {
      await lock?.release().catch(() => undefined);
      lock = null;
      return;
    }
    if (lock || requesting || !('wakeLock' in navigator) || document.hidden) return;
    requesting = true;
    try {
      const acquired = await navigator.wakeLock.request('screen');
      acquired.addEventListener('release', () => {
        if (lock === acquired) lock = null;
      });
      lock = acquired;
      if (!wanted) void sync();
    } catch {
      // Unsupported or denied (low battery): the session simply runs without it.
    } finally {
      requesting = false;
    }
  }

  // The browser drops the lock whenever the page is hidden.
  document.addEventListener('visibilitychange', () => void sync());

  return {
    set(on) {
      if (on === wanted) return;
      wanted = on;
      void sync();
    }
  };
}

export function createWebPlatform(): Platform {
  return { storage, cache: createIndexedDbCache(), keepAwake: createWakeLock() };
}
