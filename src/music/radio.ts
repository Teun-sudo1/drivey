import { STYLES, type StyleId } from './styles';
import { fetchJson, type MusicProvider, type Track } from './types';

/** The official list of mirrors; a few known ones stand in if it can't be fetched. */
const SERVER_LIST = 'https://all.api.radio-browser.info/json/servers';
const FALLBACK_SERVERS = ['de1.api.radio-browser.info', 'nl1.api.radio-browser.info', 'at1.api.radio-browser.info'];
const STATIONS_PER_TAG = 40;
/** Low-bitrate streams sound poor through a car's worth of reverb and noise. */
const MIN_BITRATE = 64;

interface Station {
  stationuuid: string;
  name: string;
  url_resolved: string;
  homepage: string;
  bitrate: number;
  lastcheckok: number;
}

/**
 * Live lofi radio from the Radio Browser directory, which needs no key. The
 * directory asks apps to send a descriptive User-Agent, but browsers don't let
 * a page set one; a native (Capacitor) build should.
 */
export class RadioProvider implements MusicProvider {
  readonly id = 'radio';
  private servers: string[] | null = null;

  async search(style: StyleId): Promise<Track[]> {
    const found = new Map<string, Station>();
    for (const tag of STYLES[style].radioTags) {
      const stations = await this.query<Station[]>(`/json/stations/bytag/${encodeURIComponent(tag)}?hidebroken=true&order=bitrate&reverse=true&limit=${STATIONS_PER_TAG}`);
      // Only stations that passed their last check, at a decent bitrate, and on
      // https, since a secure page can't play an insecure stream.
      for (const s of stations) if (s.lastcheckok === 1 && s.bitrate >= MIN_BITRATE && s.url_resolved.startsWith('https:')) found.set(s.stationuuid, s);
    }
    return [...found.values()].sort((a, b) => b.bitrate - a.bitrate).map((s): Track => ({
      key: `radio:${s.stationuuid}`,
      provider: 'radio',
      kind: 'stream',
      style,
      title: s.name.trim(),
      artist: `Live radio · ${s.bitrate} kbps`,
      link: s.homepage || undefined,
      url: s.url_resolved
    }));
  }

  async getStream(track: Track): Promise<string> {
    return track.url ?? '';
  }

  /** Tries each mirror in turn, so one being down doesn't stop the radio. */
  private async query<T>(path: string): Promise<T> {
    let lastError: unknown = null;
    for (const server of await this.serverList()) {
      try {
        return await fetchJson<T>(`https://${server}${path}`);
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError ?? new Error('No Radio Browser server reachable');
  }

  private async serverList(): Promise<string[]> {
    if (this.servers) return this.servers;
    try {
      const list = await fetchJson<{ name: string }[]>(SERVER_LIST);
      const names = [...new Set(list.map(s => s.name))];
      // Shuffled, as the directory asks, to spread the load across mirrors.
      this.servers = names.length ? names.sort(() => Math.random() - 0.5) : FALLBACK_SERVERS;
    } catch {
      this.servers = FALLBACK_SERVERS;
    }
    return this.servers;
  }
}
