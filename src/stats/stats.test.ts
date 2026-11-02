import { describe, expect, it } from 'vitest';
import { fromArchive, toArchive } from './archive';
import { summarize, type SessionRecord } from './sessions';

const session = (endedAt: Date, minutes = 25, task = ''): SessionRecord => ({ endedAt: endedAt.getTime(), minutes, task, route: 'city', tod: 'night', weather: 'rain' });
const at = (day: number, hour: number) => new Date(2026, 10, day, hour);

describe('summarize', () => {
  const now = at(12, 15);

  it('totals today, the last seven days and each day of the chart', () => {
    const s = summarize([session(at(12, 9)), session(at(11, 23), 50), session(at(6, 10), 30), session(at(5, 10), 40)], now, 7);
    expect(s.todayMinutes).toBe(25);
    expect(s.weekMinutes).toBe(25 + 50 + 30);
    expect(s.days.map(d => d.minutes)).toEqual([30, 0, 0, 0, 0, 50, 25]);
    expect(s.days[0].date).toEqual(at(6, 0));
  });

  it('counts the streak back from yesterday until today has a session', () => {
    const past = [session(at(11, 20)), session(at(10, 8)), session(at(8, 8))];
    expect(summarize(past, now, 7).streak).toBe(2);
    expect(summarize([...past, session(at(12, 8))], now, 7).streak).toBe(3);
    expect(summarize([session(at(10, 8))], now, 7).streak).toBe(0);
  });

  it('keeps calendar days across a daylight saving change', () => {
    // Clocks went back on 25 October 2026 in Europe; the chart still has one bar per date.
    const s = summarize([session(new Date(2026, 9, 25, 12))], new Date(2026, 9, 26, 12), 30);
    expect(new Set(s.days.map(d => d.date.getDate())).size).toBe(30);
    expect(s.days.at(-2)!.minutes).toBe(25);
  });
});

describe('archive', () => {
  it('round-trips sessions', () => {
    const sessions = [session(at(3, 9), 25, 'Write the report'), session(at(4, 9), 45)];
    expect(fromArchive(toArchive(sessions, at(5, 0)))).toEqual({ sessions, skipped: 0 });
  });

  it('leaves out invalid entries and trims long task names', () => {
    const text = JSON.stringify({ app: 'drivey', version: 1, sessions: [{ ...session(at(3, 9)), task: 'x'.repeat(200) }, { ...session(at(3, 10)), route: 'moon' }, { endedAt: 'soon' }, null] });
    const result = fromArchive(text);
    expect(result.skipped).toBe(3);
    expect(result.sessions[0].task).toHaveLength(80);
  });

  it('rejects files that are not a Drivey export', () => {
    expect(() => fromArchive('not json')).toThrow('isn’t a Drivey export');
    expect(() => fromArchive('{"app":"other","sessions":[]}')).toThrow('isn’t a Drivey export');
    expect(() => fromArchive('{"app":"drivey","version":2,"sessions":[]}')).toThrow('newer Drivey');
  });
});
