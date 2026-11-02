export type Phase = 'focus' | 'short' | 'long';

export interface PomodoroConfig {
  /** Phase lengths in minutes. */
  focus: number;
  short: number;
  long: number;
  /** A long break follows every Nth completed focus session. */
  every: number;
  auto: boolean;
}

export interface PhaseEnd {
  ended: Phase;
  next: Phase;
  endedAt: number;
  /** How long the ended phase ran, which a duration edit mid-phase doesn't change. */
  minutes: number;
}

type Listener<T> = (value: T) => void;

/**
 * Timestamp-based: remaining time is always derived from an absolute end time,
 * so throttled or suspended ticks can't make it drift.
 */
export class Pomodoro {
  phase: Phase = 'focus';
  running = false;
  remainingMs: number;
  completedFocus = 0;

  private endAt = 0;
  private lengthMs: number;
  /** True until the current phase is first started; only then may a duration edit apply to it. */
  private fresh = true;
  private readonly changeListeners = new Set<() => void>();
  private readonly phaseEndListeners = new Set<Listener<PhaseEnd>>();

  constructor(
    private readonly config: () => PomodoroConfig,
    private readonly now: () => number = Date.now
  ) {
    this.lengthMs = this.remainingMs = this.phaseLength(this.phase);
  }

  /** How far through the current phase, 0 to 1. */
  get progress(): number {
    return 1 - this.remainingMs / this.lengthMs;
  }

  /** When the running phase will end, in ms since 1970; null while paused. */
  get endsAt(): number | null {
    return this.running ? this.endAt : null;
  }

  onChange(listener: () => void): void {
    this.changeListeners.add(listener);
  }

  onPhaseEnd(listener: Listener<PhaseEnd>): void {
    this.phaseEndListeners.add(listener);
  }

  start(): void {
    if (this.running) return;
    this.endAt = this.now() + this.remainingMs;
    this.running = true;
    this.fresh = false;
    this.notify();
  }

  pause(): void {
    if (!this.running) return;
    this.remainingMs = Math.max(0, this.endAt - this.now());
    this.running = false;
    this.notify();
  }

  toggle(): void {
    if (this.running) this.pause();
    else this.start();
  }

  reset(): void {
    this.running = false;
    this.enterPhase(this.phase);
    this.notify();
  }

  /** Moves on without counting the current phase as completed. */
  skip(): void {
    this.running = false;
    this.enterPhase(this.phase === 'focus' ? 'short' : 'focus');
    this.notify();
  }

  syncDurations(): void {
    if (this.fresh) this.lengthMs = this.remainingMs = this.phaseLength(this.phase);
    this.notify();
  }

  tick(): void {
    if (!this.running) return;
    const now = this.now();
    this.remainingMs = this.endAt - now;
    // A loop because a suspended tab with auto-start can miss several phases.
    while (this.running && this.remainingMs <= 0) this.completePhase(now);
    this.remainingMs = Math.max(0, this.remainingMs);
    this.notify();
  }

  private completePhase(now: number): void {
    const ended = this.phase;
    const endedAt = this.endAt;
    const minutes = this.lengthMs / 60_000;
    let next: Phase = 'focus';
    if (ended === 'focus') {
      this.completedFocus++;
      next = this.completedFocus % this.config().every === 0 ? 'long' : 'short';
    }
    this.enterPhase(next);
    if (this.config().auto) {
      // Chain from when the phase should have ended, not from when we noticed.
      this.endAt = endedAt + this.remainingMs;
      this.remainingMs = this.endAt - now;
      this.fresh = false;
    } else {
      this.running = false;
    }
    for (const listener of this.phaseEndListeners) listener({ ended, next, endedAt, minutes });
  }

  private enterPhase(phase: Phase): void {
    this.phase = phase;
    this.lengthMs = this.remainingMs = this.phaseLength(phase);
    this.fresh = true;
  }

  private phaseLength(phase: Phase): number {
    return this.config()[phase] * 60_000;
  }

  private notify(): void {
    for (const listener of this.changeListeners) listener();
  }
}
