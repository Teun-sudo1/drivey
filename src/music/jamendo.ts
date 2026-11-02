import type { TimedCache } from './cache';
import { STYLES, type StyleId } from './styles';
import { fetchJson, type MusicProvider, type Track } from './types';

const API = 'https://api.jamendo.com/v3.0/tracks/';
const PAGE_SIZE = 50;

interface JamendoTrack {
  id: string;
  name: string;
  artist_name: string;
  audio: string;
  shareurl: string;
  license_ccurl: string;
}

interface JamendoResponse {
  headers: { code: number; error_message?: string };
  results: JamendoTrack[];
}

/** "https://creativecommons.org/licenses/by-nc-sa/3.0/" → "CC BY-NC-SA 3.0". */
export function licenseName(url: string): string {
  const m = /licenses\/([a-z-]+)\/([\d.]+)/.exec(url);
  return m ? `CC ${m[1].toUpperCase()} ${m[2]}` : 'Creative Commons';
}

/**
 * Creative Commons tracks from Jamendo. The free tier is non-commercial and
 * capped per month, so pages are cached for a day and only fetched when the
 * queue runs out.
 */
export class JamendoProvider implements MusicProvider {
  readonly id = 'jamendo';
  private readonly pages = new Map<StyleId, number>();

  constructor(private readonly clientId: string, private readonly cache: TimedCache) {}

  get enabled(): boolean {
    return this.clientId !== '';
  }

  search(style: StyleId): Promise<Track[]> {
    this.pages.set(style, 0);
    return this.page(style, 0);
  }

  /** The next page of results for a style, for when the queue runs low. */
  more(style: StyleId): Promise<Track[]> {
    const next = (this.pages.get(style) ?? 0) + 1;
    this.pages.set(style, next);
    return this.page(style, next);
  }

  async getStream(track: Track): Promise<string> {
    return track.url ?? '';
  }

  private page(style: StyleId, page: number): Promise<Track[]> {
    if (!this.enabled) return Promise.resolve([]);
    return this.cache.through(`jamendo:${style}:${page}`, async () => {
      const params = new URLSearchParams({
        client_id: this.clientId,
        format: 'json',
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
        fuzzytags: STYLES[style].jamendoTags.join('+'),
        audioformat: 'mp32',
        include: 'licenses',
        order: 'popularity_month'
      });
      const data = await fetchJson<JamendoResponse>(`${API}?${params}`);
      if (data.headers.code !== 0) throw new Error(data.headers.error_message ?? `Jamendo error ${data.headers.code}`);
      return data.results.map((t): Track => ({
        key: `jamendo:${t.id}`,
        provider: 'jamendo',
        kind: 'track',
        style,
        title: t.name,
        artist: t.artist_name,
        license: licenseName(t.license_ccurl),
        licenseUrl: t.license_ccurl,
        link: t.shareurl,
        url: t.audio
      }));
    });
  }
}
