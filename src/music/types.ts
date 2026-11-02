import type { StyleId } from './styles';

export type ProviderId = 'jamendo' | 'radio' | 'local' | 'generated';

/** Something the player can play: a finite track, an endless stream, or music made live. */
export interface Track {
  /** Unique across providers, e.g. `jamendo:12345`. */
  key: string;
  provider: ProviderId;
  kind: 'track' | 'stream' | 'generated';
  style: StyleId;
  title: string;
  artist: string;
  license?: string;
  licenseUrl?: string;
  /** Where to find out more, or to support the artist. */
  link?: string;
  /** Where the audio comes from; generated music has none. */
  url?: string;
}

export interface MusicProvider {
  readonly id: ProviderId;
  search(style: StyleId): Promise<Track[]>;
  /** The URL to play; a provider may need to resolve it first. */
  getStream(track: Track): Promise<string>;
}

/** Thrown when a provider asks us to slow down, so the player can rest it for a while. */
export class RateLimited extends Error {}

/** Fetches JSON, turning a 429 into RateLimited and other failures into ordinary errors. */
export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (res.status === 429) throw new RateLimited(url);
  if (!res.ok) throw new Error(`${res.status} from ${url}`);
  return res.json() as Promise<T>;
}
