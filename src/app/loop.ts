import { clamp } from '../lib/math';

const MAX_DT = 0.05;

/** Runs the frame callback while the tab is visible; nothing renders while it's hidden. */
export function startLoop(frame: (dt: number) => void): void {
  let handle = 0;
  let last = 0;

  const step = (now: number): void => {
    handle = requestAnimationFrame(step);
    // A frame's timestamp can predate the performance.now() taken in resume(), so dt can be negative.
    const dt = clamp((now - last) / 1000, 0, MAX_DT);
    last = now;
    frame(dt);
  };
  const resume = (): void => {
    last = performance.now();
    handle = requestAnimationFrame(step);
  };

  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(handle);
    if (!document.hidden) resume();
  });
  if (!document.hidden) resume();
}
