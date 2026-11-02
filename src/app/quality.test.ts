import { describe, expect, it } from 'vitest';
import { FrameWatch, lowerQuality, resolveQuality } from './quality';

/** Feeds a run of equal frames and says whether any of them asked to step down. */
const run = (watch: FrameWatch, seconds: number, fps: number): boolean => {
  let stepped = false;
  for (let t = 0; t < seconds; t += 1 / fps) stepped = watch.note(1 / fps) || stepped;
  return stepped;
};

describe('auto quality', () => {
  it('suits the device, never above the cap, and leaves a chosen level alone', () => {
    expect(resolveQuality('auto', false)).toBe('high');
    expect(resolveQuality('auto', true)).toBe('medium');
    expect(resolveQuality('auto', false, 'medium')).toBe('medium');
    expect(resolveQuality('auto', true, 'low')).toBe('low');
    expect(resolveQuality('high', true, 'low')).toBe('high');
    expect([lowerQuality('high'), lowerQuality('medium'), lowerQuality('low')]).toEqual(['medium', 'low', null]);
  });

  it('steps down after a few seconds of slow frames, not for smooth ones or a short hitch', () => {
    expect(run(new FrameWatch(), 20, 60)).toBe(false);
    expect(run(new FrameWatch(), 20, 45)).toBe(false);

    const hitch = new FrameWatch();
    run(hitch, 5, 60);
    expect(run(hitch, 2, 20)).toBe(false);
    expect(run(hitch, 10, 60)).toBe(false);

    const slow = new FrameWatch();
    expect(run(slow, 3, 25)).toBe(false);
    expect(run(slow, 6, 25)).toBe(true);
  });

  it('starts over after stepping down, giving the new level time to settle', () => {
    const watch = new FrameWatch();
    expect(run(watch, 9, 25)).toBe(true);
    expect(run(watch, 4, 25)).toBe(false);
  });
});
