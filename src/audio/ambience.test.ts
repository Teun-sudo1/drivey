import { describe, expect, it } from 'vitest';
import { sceneLevels } from './ambience';
import { WEATHERS } from '../weather/tables';

describe('sceneLevels', () => {
  const base = { weather: WEATHERS.clear, route: 'city' as const, speed: 22, engine: 'running' as const, shelter: 0 };

  it('brings rain on the glass up with the rain, and silences it in a tunnel', () => {
    expect(sceneLevels(base).rain).toBe(0);
    expect(sceneLevels({ ...base, weather: WEATHERS.heavy }).rain).toBeCloseTo(0.9);
    expect(sceneLevels({ ...base, weather: WEATHERS.heavy, shelter: 1 }).rain).toBe(0);
  });

  it('only hums with the engine running, louder with speed', () => {
    expect(sceneLevels({ ...base, engine: 'on' }).engine).toBe(0);
    expect(sceneLevels({ ...base, speed: 28 }).engine).toBeGreaterThan(sceneLevels({ ...base, speed: 5 }).engine);
  });

  it('runs the wipers only in wet weather with the ignition on', () => {
    expect(sceneLevels({ ...base, weather: WEATHERS.rain }).wipers).toBe(1);
    expect(sceneLevels({ ...base, weather: WEATHERS.rain, engine: 'acc' }).wipers).toBe(0);
    expect(sceneLevels(base).wipers).toBe(0);
  });

  it('makes the city busy, the countryside quiet and the coast windy', () => {
    expect(sceneLevels(base).traffic).toBeGreaterThan(sceneLevels({ ...base, route: 'country' }).traffic);
    expect(sceneLevels({ ...base, route: 'coast' }).wind).toBeGreaterThan(sceneLevels(base).wind);
  });
});
