export type StyleId = 'chillhop' | 'jazzy' | 'ambient' | 'synthwave' | 'rainycafe';

export const STYLES: Record<StyleId, { name: string }> = {
  chillhop: { name: 'Chillhop' },
  jazzy: { name: 'Jazzy' },
  ambient: { name: 'Ambient' },
  synthwave: { name: 'Synthwave' },
  rainycafe: { name: 'Rainy café' }
};
