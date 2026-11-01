import { beforeEach, describe, expect, it } from 'vitest';
import { Pomodoro, type PhaseEnd, type PomodoroConfig } from './pomodoro';

const MIN = 60_000;

describe('Pomodoro', () => {
  let time: number;
  let config: PomodoroConfig;
  let timer: Pomodoro;
  let ends: PhaseEnd[];

  beforeEach(() => {
    time = 1_000_000;
    config = { focus: 25, short: 5, long: 15, every: 4, auto: false };
    timer = new Pomodoro(() => config, () => time);
    ends = [];
    timer.onPhaseEnd(e => ends.push(e));
  });

  it('derives remaining time from timestamps, however rarely it ticks', () => {
    timer.start();
    time += 10 * MIN;
    timer.tick();
    expect(timer.remainingMs).toBe(15 * MIN);
  });

  it('keeps the remaining time across a pause', () => {
    timer.start();
    time += 10 * MIN;
    timer.pause();
    time += 60 * MIN;
    timer.tick();
    expect(timer.remainingMs).toBe(15 * MIN);
    timer.start();
    time += 15 * MIN;
    timer.tick();
    expect(ends).toHaveLength(1);
  });

  it('stops after a phase when auto-start is off', () => {
    timer.start();
    time += 25 * MIN + 500;
    timer.tick();
    expect(timer.phase).toBe('short');
    expect(timer.running).toBe(false);
    expect(timer.remainingMs).toBe(5 * MIN);
    expect(timer.completedFocus).toBe(1);
  });

  it('schedules a long break every Nth completed session', () => {
    const phases: string[] = [];
    for (let i = 0; i < 8; i++) {
      timer.start();
      time += timer.remainingMs;
      timer.tick();
      phases.push(timer.phase);
    }
    expect(phases).toEqual(['short', 'focus', 'short', 'focus', 'short', 'focus', 'long', 'focus']);
  });

  it('chains auto-started phases from their scheduled end after a long suspension', () => {
    config.auto = true;
    timer.start();
    const startedAt = time;
    time += 32 * MIN; // 25 focus + 5 short + 2 into the next focus
    timer.tick();
    expect(timer.phase).toBe('focus');
    expect(timer.running).toBe(true);
    expect(timer.remainingMs).toBe(23 * MIN);
    expect(ends.map(e => e.endedAt)).toEqual([startedAt + 25 * MIN, startedAt + 30 * MIN]);
  });

  it('does not count a skipped session', () => {
    timer.start();
    timer.skip();
    expect(timer.phase).toBe('short');
    expect(timer.running).toBe(false);
    expect(timer.completedFocus).toBe(0);
    expect(ends).toHaveLength(0);
  });

  it('applies duration edits only to a phase that has not started', () => {
    config.focus = 30;
    timer.syncDurations();
    expect(timer.remainingMs).toBe(30 * MIN);

    timer.start();
    time += MIN;
    timer.pause();
    config.focus = 50;
    timer.syncDurations();
    expect(timer.remainingMs).toBe(29 * MIN);

    timer.reset();
    expect(timer.remainingMs).toBe(50 * MIN);
  });
});
