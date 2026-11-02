import { describe, expect, it } from 'vitest';
import { sceneLevels } from '../audio/ambience';
import { WEATHERS } from '../weather/tables';
import { TimedCache } from './cache';
import { licenseName } from './jamendo';
import { TrackPrefs } from './prefs';

function memoryStore() {
  const data = new Map<string, string>();
  return { data, get: async (k: string) => data.get(k) ?? null, set: async (k: string, v: string) => void data.set(k, v) };
}

describe('licenseName', () => {
  it('reads the licence and version from a Creative Commons URL', () => {
    expect(licenseName('https://creativecommons.org/licenses/by-nc-sa/3.0/')).toBe('CC BY-NC-SA 3.0');
    expect(licenseName('http://creativecommons.org/licenses/by/4.0/')).toBe('CC BY 4.0');
    expect(licenseName('')).toBe('Creative Commons');
  });
});

describe('TimedCache', () => {
  it('serves fresh values and reloads stale ones', async () => {
    const store = memoryStore();
    const cache = new TimedCache(store, 1000);
    let loads = 0;
    const load = async () => ++loads;
    expect(await cache.through('k', load)).toBe(1);
    expect(await cache.through('k', load)).toBe(1);
    // Ages the entry past its lifetime.
    const entry = JSON.parse(store.data.get('k')!);
    store.data.set('k', JSON.stringify({ ...entry, at: entry.at - 2000 }));
    expect(await cache.through('k', load)).toBe(2);
  });

  it('treats unreadable entries as missing', async () => {
    const store = memoryStore();
    store.data.set('k', 'not json');
    expect(await new TimedCache(store, 1000).get('k')).toBeNull();
  });
});

describe('TrackPrefs', () => {
  it('keeps likes and bans across loads, and a ban removes a like', async () => {
    const store = memoryStore();
    const prefs = await TrackPrefs.load(store);
    expect(prefs.toggleLike('a')).toBe(true);
    prefs.toggleLike('b');
    prefs.ban('b');
    const again = await TrackPrefs.load(store);
    expect(again.isLiked('a')).toBe(true);
    expect(again.isLiked('b')).toBe(false);
    expect(again.isBanned('b')).toBe(true);
  });

  it('ignores corrupt storage', async () => {
    const store = memoryStore();
    store.data.set('nd.music', '{"liked": [1, "x"], "never": "nope"}');
    const prefs = await TrackPrefs.load(store);
    expect(prefs.isLiked('x')).toBe(true);
    expect(prefs.isBanned('nope')).toBe(false);
  });
});

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
