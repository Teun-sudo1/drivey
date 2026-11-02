import type { StyleId } from '../music/styles';

export type Voice = 'keys' | 'piano' | 'pad' | 'synth';

interface Chord {
  /** Root, as a MIDI note, for the bass. */
  r: number;
  n: number[];
}

/** One generated style: 16-step drum and bass patterns, a chord loop, and a scale for the melody. */
export interface GeneratedStyle {
  bpm: number;
  swing: number;
  voice: Voice;
  /** Reverb mix, 0 to 1. */
  wet: number;
  /** Vinyl crackle level. */
  crackle: number;
  brush?: boolean;
  walk?: boolean;
  arp?: boolean;
  chordBars?: number;
  ch: Chord[];
  kick: string;
  snare: string;
  hat: string;
  bass: string;
  scale: number[];
  /** Chance per beat of starting a melody note. */
  mel: number;
}

/** Tuned in the prototype; kept as they were. */
export const GENERATED_STYLES: Record<StyleId, GeneratedStyle> = {
  chillhop: {
    bpm: 84, swing: 0.17, voice: 'keys', wet: 0.22, crackle: 0.07,
    ch: [{ r: 41, n: [53, 57, 60, 64] }, { r: 40, n: [52, 55, 59, 62] }, { r: 38, n: [50, 53, 57, 60, 64] }, { r: 36, n: [48, 52, 55, 59, 62] }],
    kick: 'x......x..x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', bass: 'x.........x.....', scale: [64, 67, 69, 72, 74, 76], mel: 0.14
  },
  jazzy: {
    bpm: 72, swing: 0.24, voice: 'keys', wet: 0.28, crackle: 0.09, brush: true, walk: true,
    ch: [{ r: 38, n: [53, 57, 60, 64] }, { r: 43, n: [53, 57, 59, 64] }, { r: 36, n: [52, 55, 59, 62] }, { r: 45, n: [55, 58, 61, 64] }],
    kick: 'x.........x.....', snare: '....x.......x...', hat: 'x..x..x.x..x..x.', bass: 'x...x...x...x...', scale: [62, 64, 65, 67, 69, 72, 74], mel: 0.18
  },
  ambient: {
    bpm: 60, swing: 0, voice: 'pad', wet: 0.55, crackle: 0.03, chordBars: 2,
    ch: [{ r: 36, n: [55, 59, 62, 64] }, { r: 33, n: [55, 59, 60, 64] }, { r: 29, n: [57, 60, 64, 71] }, { r: 31, n: [55, 59, 62, 64] }],
    kick: '', snare: '', hat: '', bass: 'x...............', scale: [67, 71, 74, 76, 79], mel: 0.07
  },
  synthwave: {
    bpm: 92, swing: 0, voice: 'synth', wet: 0.35, crackle: 0, arp: true,
    ch: [{ r: 33, n: [57, 60, 64] }, { r: 29, n: [57, 60, 65] }, { r: 36, n: [55, 60, 64] }, { r: 31, n: [55, 59, 62] }],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', bass: 'x.x.x.x.x.x.x.x.', scale: [69, 72, 74, 76, 79], mel: 0
  },
  rainycafe: {
    bpm: 68, swing: 0.2, voice: 'piano', wet: 0.3, crackle: 0.1,
    ch: [{ r: 39, n: [51, 55, 58, 62] }, { r: 36, n: [51, 55, 58, 60] }, { r: 41, n: [53, 56, 60, 63] }, { r: 34, n: [50, 53, 56, 58] }],
    kick: 'x.......x.......', snare: '............x...', hat: 'x...x...x...x...', bass: 'x.......x.......', scale: [63, 65, 67, 70, 72, 75], mel: 0.2
  }
};
