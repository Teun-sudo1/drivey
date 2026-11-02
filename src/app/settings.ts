import { CHANNELS, type Mix } from '../audio/engine';
import { clamp } from '../lib/math';
import { SOURCE_MODES, type SourceMode } from '../music/player';
import { STYLES, STYLE_IDS, type StyleId } from '../music/styles';
import type { KeyValueStorage } from '../platform/types';
import { ROUTES, type RouteId } from '../routes';
import { TIMES_OF_DAY, WEATHERS, type TimeOfDayId, type WeatherId } from '../weather/tables';

export type DriveSide = 'left' | 'right';

export interface MixerPreset {
  name: string;
  mix: Mix;
}

export const MAX_PRESETS = 12;
export const MAX_PRESET_NAME = 40;

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
  style: StyleId;
  /** Where each style's music comes from. */
  sources: Record<StyleId, SourceMode>;
  mix: Mix;
  /** Whether the weather and road shape the ambient levels. */
  follow: boolean;
  muted: boolean;
  /** Whether music plays once the engine is running. */
  musicOn: boolean;
  shuffle: boolean;
  mixerPresets: MixerPreset[];
}

export type DurationKey = 'focus' | 'short' | 'long' | 'every';
export type ToggleKey = 'bloom' | 'vignette' | 'grain' | 'reduced' | 'auto' | 'breakSlow' | 'follow' | 'shuffle' | 'muted';

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
    breakSlow: true,
    style: 'chillhop',
    sources: Object.fromEntries(STYLE_IDS.map(id => [id, 'mix'])) as Record<StyleId, SourceMode>,
    mix: defaultMix(),
    follow: true,
    muted: false,
    musicOn: true,
    shuffle: true,
    mixerPresets: []
  };
}

export function defaultMix(): Mix {
  return { music: 0.55, rain: 0.55, engine: 0.35, wipers: 0.5, traffic: 0.3, wind: 0.2 };
}

function sanitizeMix(raw: unknown): Mix | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const mix = defaultMix();
  for (const k of CHANNELS) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === 'number' && Number.isFinite(v)) mix[k] = clamp(v, 0, 1);
  }
  return mix;
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
  if (isKeyOf(STYLES, raw.style)) s.style = raw.style;
  if (typeof raw.sources === 'object' && raw.sources !== null) {
    for (const id of STYLE_IDS) {
      const mode = (raw.sources as Record<string, unknown>)[id];
      if (isKeyOf(SOURCE_MODES, mode)) s.sources[id] = mode;
    }
  }
  s.mix = sanitizeMix(raw.mix) ?? s.mix;
  if (Array.isArray(raw.mixerPresets)) {
    s.mixerPresets = raw.mixerPresets.flatMap((p: unknown) => {
      const preset = p as Partial<MixerPreset> | null;
      const mix = sanitizeMix(preset?.mix);
      return typeof preset?.name === 'string' && preset.name.trim() && mix ? [{ name: preset.name.trim().slice(0, MAX_PRESET_NAME), mix }] : [];
    }).slice(0, MAX_PRESETS);
  }
  for (const k of ['bloom', 'vignette', 'grain', 'reduced', 'auto', 'breakSlow', 'follow', 'muted', 'musicOn', 'shuffle'] as const) {
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
