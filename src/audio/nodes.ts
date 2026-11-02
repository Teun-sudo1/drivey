/** Small Web Audio building blocks shared by the ambience, effects and generated music. */

export type NoiseKind = 'white' | 'brown' | 'crackle';

const NOISE_SECONDS = 3;

export function noiseBuffer(ctx: BaseAudioContext, kind: NoiseKind): AudioBuffer {
  const len = ctx.sampleRate * NOISE_SECONDS;
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') d[i] = w;
    else if (kind === 'brown') {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = (Math.random() < 0.0007 ? (Math.random() * 2 - 1) * 0.9 : 0) + w * 0.012;
  }
  return buffer;
}

/** A decaying noise tail, for a convolution reverb. */
export function impulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const len = ctx.sampleRate * seconds;
  const buffer = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buffer.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  return buffer;
}

export function filter(ctx: BaseAudioContext, type: BiquadFilterType, frequency: number, q = 0.7): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = q;
  return f;
}

/** Loops a buffer through a chain of nodes into dest, starting at a random point so loops don't line up. */
export function loop(ctx: BaseAudioContext, buffer: AudioBuffer, chain: AudioNode[], dest: AudioNode, gain: number): AudioBufferSourceNode {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  let node: AudioNode = source;
  for (const f of chain) {
    node.connect(f);
    node = f;
  }
  const g = ctx.createGain();
  g.gain.value = gain;
  node.connect(g);
  g.connect(dest);
  source.start(0, Math.random() * 2);
  return source;
}

export const midiToHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
