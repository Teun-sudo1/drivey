export type StyleId = 'chillhop' | 'jazzy' | 'ambient' | 'synthwave' | 'rainycafe';

export interface StyleConfig {
  name: string;
  /** Jamendo tags, combined with OR. */
  jamendoTags: readonly string[];
  /** Radio Browser station tags, tried in order. */
  radioTags: readonly string[];
}

/** Each style mapped to what every provider calls it. */
export const STYLES: Record<StyleId, StyleConfig> = {
  chillhop: { name: 'Chillhop', jamendoTags: ['lofi', 'chillhop'], radioTags: ['lofi', 'chillhop', 'lo-fi'] },
  jazzy: { name: 'Jazzy', jamendoTags: ['jazz', 'jazzhop'], radioTags: ['jazzhop', 'smooth jazz', 'jazz'] },
  ambient: { name: 'Ambient', jamendoTags: ['ambient', 'chillout'], radioTags: ['ambient', 'chillout'] },
  synthwave: { name: 'Synthwave', jamendoTags: ['synthwave', 'retrowave'], radioTags: ['synthwave', 'retrowave'] },
  rainycafe: { name: 'Rainy café', jamendoTags: ['lounge', 'piano'], radioTags: ['lounge', 'cafe', 'piano'] }
};

export const STYLE_IDS = Object.keys(STYLES) as StyleId[];
