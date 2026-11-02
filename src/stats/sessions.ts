import type { RouteId } from '../routes';
import type { TimeOfDayId, WeatherId } from '../weather/tables';

export const MAX_TASK = 80;

/** One completed focus session. */
export interface SessionRecord {
  /** When it ended, in ms since 1970; also its key, so re-importing a session replaces it. */
  endedAt: number;
  minutes: number;
  task: string;
  route: RouteId;
  tod: TimeOfDayId;
  weather: WeatherId;
}

export interface DayTotal {
  /** Local midnight that starts the day. */
  date: Date;
  minutes: number;
}

export interface Summary {
  todayMinutes: number;
  /** Today and the six days before it. */
  weekMinutes: number;
  /** Days in a row with a session, counting back from today, or from yesterday until today has one. */
  streak: number;
  /** Oldest first, ending today. */
  days: DayTotal[];
}

/** Local calendar day, so a session at 23:50 counts for the evening it happened in. */
const dayKey = (d: Date): number => d.getFullYear() * 10_000 + d.getMonth() * 100 + d.getDate();

/** Midnight `back` days before `now`; built from the date parts, so daylight saving can't skip a day. */
const daysAgo = (now: Date, back: number): Date => new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);

export function summarize(sessions: readonly SessionRecord[], now: Date, dayCount: number): Summary {
  const perDay = new Map<number, number>();
  for (const s of sessions) {
    const key = dayKey(new Date(s.endedAt));
    perDay.set(key, (perDay.get(key) ?? 0) + s.minutes);
  }
  const minutesOn = (back: number): number => perDay.get(dayKey(daysAgo(now, back))) ?? 0;

  let weekMinutes = 0;
  for (let back = 0; back < 7; back++) weekMinutes += minutesOn(back);
  let streak = 0;
  for (let back = minutesOn(0) ? 0 : 1; minutesOn(back); back++) streak++;
  const days = Array.from({ length: dayCount }, (_, i) => {
    const back = dayCount - 1 - i;
    return { date: daysAgo(now, back), minutes: minutesOn(back) };
  });
  return { todayMinutes: minutesOn(0), weekMinutes, streak, days };
}
