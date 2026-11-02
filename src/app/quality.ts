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

/** Auto suits the device: phones and tablets get Medium, computers High. */
export function resolveQuality(id: QualityId, touchScreen: boolean): QualityLevel {
  if (id !== 'auto') return id;
  return touchScreen ? 'medium' : 'high';
}
