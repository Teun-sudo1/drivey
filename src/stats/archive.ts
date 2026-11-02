import type { RouteId } from '../routes';
import { TIMES_OF_DAY, WEATHERS } from '../weather/tables';
import { MAX_TASK, type SessionRecord } from './sessions';

const APP = 'drivey';
const VERSION = 1;
/** Longer than any focus length the timer allows, so only nonsense is rejected. */
const MAX_MINUTES = 600;
/** The route ids without the route modules, which build scenery; a new route makes this fail to compile. */
const ROUTES: Record<RouteId, true> = { city: true, coast: true, highway: true, country: true };

/** The exported file: versioned, so a later format can still read it. */
export function toArchive(sessions: readonly SessionRecord[], now: Date): string {
  return JSON.stringify({ app: APP, version: VERSION, exportedAt: now.toISOString(), sessions }, null, 1);
}

export interface ImportResult {
  sessions: SessionRecord[];
  /** Entries that weren't valid sessions and were left out. */
  skipped: number;
}

const isKeyOf = <T extends object>(table: T, v: unknown): v is keyof T => typeof v === 'string' && Object.hasOwn(table, v);

function toRecord(raw: unknown): SessionRecord | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Partial<Record<keyof SessionRecord, unknown>>;
  const { endedAt, minutes, task, route, tod, weather } = r;
  if (typeof endedAt !== 'number' || !Number.isFinite(endedAt) || endedAt <= 0) return null;
  if (typeof minutes !== 'number' || !(minutes > 0 && minutes <= MAX_MINUTES)) return null;
  if (!isKeyOf(ROUTES, route) || !isKeyOf(TIMES_OF_DAY, tod) || !isKeyOf(WEATHERS, weather)) return null;
  return { endedAt, minutes, task: typeof task === 'string' ? task.slice(0, MAX_TASK) : '', route, tod, weather };
}

/** Reads an exported file, keeping every valid session. Throws a readable message if it isn't one. */
export function fromArchive(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file isn’t a Drivey export');
  }
  const archive = data as { app?: unknown; version?: unknown; sessions?: unknown } | null;
  if (archive?.app !== APP || !Array.isArray(archive.sessions)) throw new Error('That file isn’t a Drivey export');
  if (typeof archive.version !== 'number' || archive.version > VERSION) throw new Error('That export is from a newer Drivey');
  const sessions = archive.sessions.flatMap(s => toRecord(s) ?? []);
  return { sessions, skipped: archive.sessions.length - sessions.length };
}
