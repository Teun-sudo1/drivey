import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Browser features a native shell provides differently, which only `src/platform` may touch. */
const PLATFORM_ONLY = [/\blocalStorage\b/, /\bindexedDB\b/, /\bwakeLock\b/, /\baudioSession\b/, /\bserviceWorker\.register\b/, /URL\.createObjectURL/];

const SRC = join(__dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

describe('platform boundary', () => {
  it('keeps storage, keep-awake, the audio session, offline caching and downloads inside src/platform', () => {
    const leaks = sources(SRC).flatMap(file => {
      const where = relative(SRC, file);
      if (where.startsWith('platform/')) return [];
      const text = readFileSync(file, 'utf8');
      return PLATFORM_ONLY.filter(re => re.test(text)).map(re => `${where}: ${re.source}`);
    });
    expect(leaks).toEqual([]);
  });
});
