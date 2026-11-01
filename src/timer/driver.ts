import type { Pomodoro } from './pomodoro';

const TICK_MS = 250;

/**
 * Ticks the timer independently of the render loop, which stops while the tab
 * is hidden. Background throttling only delays ticks; it can't skew the time.
 */
export function startTimerDriver(timer: Pomodoro): void {
  setInterval(() => timer.tick(), TICK_MS);
  document.addEventListener('visibilitychange', () => timer.tick());
}
