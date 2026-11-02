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
  return { storage, keepAwake: createWakeLock() };
}
