import type { StyleId } from './styles';
import { fetchJson, type MusicProvider, type Track } from './types';

/** One entry of public/music/manifest.json, written by scripts/music-manifest.mjs. */
export interface LocalEntry {
  /** Path under public/music/. */
  file: string;
  title: string;
  artist: string;
  license?: string;
  licenseUrl?: string;
  link?: string;
}

export type LocalManifest = Partial<Record<StyleId, LocalEntry[]>>;

/** Tracks shipped with the app in public/music/<style>/, for when the network fails. */
export class LocalProvider implements MusicProvider {
  readonly id = 'local';
  private manifest: Promise<LocalManifest> | null = null;

  constructor(private readonly base: string) {}

  async search(style: StyleId): Promise<Track[]> {
    // A missing manifest just means no local music.
    this.manifest ??= fetchJson<LocalManifest>(`${this.base}music/manifest.json`).catch(() => ({}));
    return ((await this.manifest)[style] ?? []).map((e): Track => ({
      key: `local:${e.file}`,
      provider: 'local',
      kind: 'track',
      style,
      title: e.title,
      artist: e.artist,
      license: e.license,
      licenseUrl: e.licenseUrl,
      link: e.link,
      url: `${this.base}music/${e.file}`
    }));
  }

  async getStream(track: Track): Promise<string> {
    return track.url ?? '';
  }
}
