import { STYLES, type StyleId } from './styles';
import type { MusicProvider, Track } from './types';

/** Music made live in the browser, so there is always something to play, even offline. */
export class GeneratedProvider implements MusicProvider {
  readonly id = 'generated';

  async search(style: StyleId): Promise<Track[]> {
    return [generatedTrack(style)];
  }

  async getStream(): Promise<string> {
    return '';
  }
}

export function generatedTrack(style: StyleId): Track {
  return { key: `generated:${style}`, provider: 'generated', kind: 'generated', style, title: `${STYLES[style].name}, generated`, artist: 'Made live in your browser' };
}
