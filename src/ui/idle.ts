const IDLE_MS = 4000;
const HIDE_KEY = 'h';

export interface IdleFade {
  wake(): void;
  toggleHidden(): void;
}

/** Fades the UI after a few quiet seconds during a session; any movement brings it back. */
export function createIdleFade(canFade: () => boolean): IdleFade {
  let timer = 0;

  function arm(): void {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (canFade()) document.body.classList.add('idle');
    }, IDLE_MS);
  }
  function wake(): void {
    document.body.classList.remove('idle');
    arm();
  }

  addEventListener('pointermove', wake, { passive: true });
  addEventListener('pointerdown', wake, { passive: true });
  addEventListener('keydown', e => {
    // The hide key toggles for itself; waking first would stop it ever showing the UI again.
    if (e.key.toLowerCase() !== HIDE_KEY) wake();
  });

  return {
    wake,
    toggleHidden: () => document.body.classList.toggle('idle')
  };
}
