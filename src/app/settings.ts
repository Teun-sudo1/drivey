import { clamp } from '../lib/math';
import type { KeyValueStorage } from '../platform/types';
import { ROUTES, type RouteId } from '../routes';
import { TIMES_OF_DAY, WEATHERS, type TimeOfDayId, type WeatherId } from '../weather/tables';

export type DriveSide = 'left' | 'right';

export interface Settings {
  route: RouteId;
  driveSide: DriveSide;
  tod: TimeOfDayId;
  weather: WeatherId;
  bloom: boolean;
  vignette: boolean;
  grain: boolean;
  reduced: boolean;
  focus: number;
  short: number;
  long: number;
  every: number;
  auto: boolean;
  breakSlow: boolean;
}

export type DurationKey = 'focus' | 'short' | 'long' | 'every';
export type ToggleKey = 'bloom' | 'vignette' | 'grain' | 'reduced' | 'auto' | 'breakSlow';

/** min, max, step */
export const DURATION_LIMITS: Record<DurationKey, readonly [number, number, number]> = {
  focus: [5, 90, 5],
  short: [1, 30, 1],
  long: [5, 45, 5],
  every: [2, 8, 1]
};

const STORAGE_KEY = 'nd.settings';

function defaults(): Settings {
  return {
    route: 'city',
    driveSide: 'left',
    tod: 'night',
    weather: 'rain',
    bloom: true,
    vignette: true,
    grain: true,
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    focus: 25,
    short: 5,
    long: 15,
    every: 4,
    auto: false,
    breakSlow: true
  };
}

/** Keeps only stored values that are still valid, so a stale or edited blob can't break startup. */
function sanitize(stored: unknown): Settings {
  const s = defaults();
  if (typeof stored !== 'object' || stored === null) return s;
  const raw = stored as Partial<Record<keyof Settings, unknown>>;
  const isKeyOf = <T extends object>(table: T, v: unknown): v is keyof T => typeof v === 'string' && Object.hasOwn(table, v);
  if (isKeyOf(ROUTES, raw.route)) s.route = raw.route;
  if (raw.driveSide === 'left' || raw.driveSide === 'right') s.driveSide = raw.driveSide;
  if (isKeyOf(TIMES_OF_DAY, raw.tod)) s.tod = raw.tod;
  if (isKeyOf(WEATHERS, raw.weather)) s.weather = raw.weather;
  for (const k of ['bloom', 'vignette', 'grain', 'reduced', 'auto', 'breakSlow'] as const) {
    const v = raw[k];
    if (typeof v === 'boolean') s[k] = v;
  }
  for (const k of ['focus', 'short', 'long', 'every'] as const) {
    const v = raw[k];
    if (typeof v === 'number' && Number.isFinite(v)) s[k] = clamp(v, DURATION_LIMITS[k][0], DURATION_LIMITS[k][1]);
  }
  return s;
}

export class SettingsStore {
  private readonly listeners = new Set<() => void>();

  private constructor(
    private readonly storage: KeyValueStorage,
    private current: Settings
  ) {}

  static async load(storage: KeyValueStorage): Promise<SettingsStore> {
    let stored: unknown = null;
    try {
      stored = JSON.parse((await storage.get(STORAGE_KEY)) ?? 'null');
    } catch {
      // Corrupt JSON falls through to the defaults.
    }
    return new SettingsStore(storage, sanitize(stored));
  }

  get value(): Readonly<Settings> {
    return this.current;
  }

  update(patch: Partial<Settings>): void {
    this.current = { ...this.current, ...patch };
    void this.storage.set(STORAGE_KEY, JSON.stringify(this.current));
    for (const listener of this.listeners) listener();
  }

  onChange(listener: () => void): void {
    this.listeners.add(listener);
  }
}
