export type QualityLevel = 'low' | 'medium' | 'high';
export type QualityId = 'auto' | QualityLevel;

/** What each level spends: the most expensive parts of a frame, scaled together. */
export interface QualityProfile {
  name: string;
  /** Highest device pixel ratio rendered at. */
  pixelRatio: number;
  /** Size of the wet-road reflection, as a share of its full size; 0 turns it off. */
  reflection: number;
  /** Rain streaks at full downpour; snow uses a share of these. */
  particles: number;
  /** Whether bloom may run, if switched on. */
  bloom: boolean;
}

export const QUALITY: Record<QualityLevel, QualityProfile> = {
  low: { name: 'Low', pixelRatio: 1, reflection: 0, particles: 500, bloom: false },
  medium: { name: 'Medium', pixelRatio: 1.5, reflection: 0.6, particles: 1100, bloom: true },
  high: { name: 'High', pixelRatio: 2, reflection: 1, particles: 2000, bloom: true }
};

export const MAX_PARTICLES = QUALITY.high.particles;

const LEVELS: readonly QualityLevel[] = ['low', 'medium', 'high'];

/**
 * Auto suits the device: phones and tablets get Medium, computers High, and never
 * above `cap`, which drops when frames turn out too slow.
 */
export function resolveQuality(id: QualityId, touchScreen: boolean, cap: QualityLevel = 'high'): QualityLevel {
  if (id !== 'auto') return id;
  const level = touchScreen ? 'medium' : 'high';
  return LEVELS[Math.min(LEVELS.indexOf(level), LEVELS.indexOf(cap))];
}

/** The next level down, or null at the bottom. */
export function lowerQuality(level: QualityLevel): QualityLevel | null {
  return LEVELS[LEVELS.indexOf(level) - 1] ?? null;
}

/** Frames slower than this on average, about 40 fps, count as struggling. */
const SLOW_FRAME = 1 / 40;
/** How long frames must struggle before stepping down, so a hitch from loading a route doesn't. */
const SLOW_FOR = 4;
/** Frames ignored after starting or a change, while shaders compile and the level takes effect. */
const SETTLE = 3;

/** Watches frame times and says when the device can't keep up with the current level. */
export class FrameWatch {
  private average = SLOW_FRAME / 2;
  private slowFor = 0;
  private settle = SETTLE;

  /** True once frames have been slow for long enough to step down; the watch then starts over. */
  note(dt: number): boolean {
    if (this.settle > 0) {
      this.settle -= dt;
      return false;
    }
    this.average += (dt - this.average) * 0.1;
    this.slowFor = this.average > SLOW_FRAME ? this.slowFor + dt : 0;
    if (this.slowFor < SLOW_FOR) return false;
    this.reset();
    return true;
  }

  reset(): void {
    this.average = SLOW_FRAME / 2;
    this.slowFor = 0;
    this.settle = SETTLE;
  }
}
