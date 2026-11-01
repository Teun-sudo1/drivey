export const rand = (a: number, b: number): number => a + Math.random() * (b - a);
export const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];
export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Frame-rate independent smoothing factor for use with lerp. */
export const damp = (rate: number, dt: number): number => 1 - Math.exp(-dt * rate);
