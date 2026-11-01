export type TimeOfDayId = 'day' | 'dusk' | 'night';
export type WeatherId = 'clear' | 'rain' | 'heavy' | 'fog' | 'snow';

export interface TimeOfDay {
  name: string;
  top: string;
  bot: string;
  fog: string;
  over: string;
  hemi: number;
  sun: number;
  sunCol: string;
  win: number;
  lamp: number;
  head: number;
  exp: number;
  bloom: number;
  star: number;
}

export interface Weather {
  name: string;
  fog: number;
  over: number;
  rain: number;
  snow: number;
  wet: number;
  dim: number;
  /** Seconds per wiper sweep; 0 parks them. */
  wipe: number;
  /** Seconds the wipers rest between sweeps. */
  wipePause: number;
  /** Opacity of the haze on the glass. */
  veil: number;
}

export const TIMES_OF_DAY: Record<TimeOfDayId, TimeOfDay> = {
  day: { name: 'Day', top: '#5b8ac2', bot: '#cfdbe6', fog: '#b7c3cf', over: '#9aa3ad', hemi: 2.4, sun: 2.6, sunCol: '#fff1dc', win: 0.06, lamp: 0, head: 0, exp: 0.95, bloom: 0.18, star: 0 },
  dusk: { name: 'Dusk', top: '#1b2047', bot: '#e0855a', fog: '#6a5466', over: '#4a4552', hemi: 0.8, sun: 0.9, sunCol: '#ff9a5c', win: 0.9, lamp: 0.8, head: 0.7, exp: 1.0, bloom: 0.55, star: 0.25 },
  night: { name: 'Night', top: '#02040a', bot: '#111a2c', fog: '#0c121c', over: '#181d26', hemi: 0.22, sun: 0.12, sunCol: '#8aa0ff', win: 1.0, lamp: 1, head: 1, exp: 1.15, bloom: 0.85, star: 1 }
};

export const WEATHERS: Record<WeatherId, Weather> = {
  clear: { name: 'Clear', fog: 0.0035, over: 0, rain: 0, snow: 0, wet: 0, dim: 1, wipe: 0, wipePause: 0, veil: 0 },
  rain: { name: 'Rain', fog: 0.008, over: 0.55, rain: 0.5, snow: 0, wet: 0.75, dim: 0.8, wipe: 1.8, wipePause: 1.4, veil: 0 },
  heavy: { name: 'Heavy rain', fog: 0.014, over: 0.85, rain: 1, snow: 0, wet: 1, dim: 0.65, wipe: 1.05, wipePause: 0, veil: 0 },
  fog: { name: 'Fog', fog: 0.032, over: 0.9, rain: 0, snow: 0, wet: 0.3, dim: 0.8, wipe: 0, wipePause: 0, veil: 0.05 },
  snow: { name: 'Snow', fog: 0.012, over: 0.8, rain: 0, snow: 1, wet: 0.2, dim: 0.85, wipe: 2.6, wipePause: 3, veil: 0 }
};
