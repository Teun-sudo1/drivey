import { pick, rand } from '../lib/math';
import type { AudioGraph } from '../audio/audioEngine';
import { filter, impulse, loop, midiToHz } from '../audio/nodes';
import { STYLES, type MusicStyle, type StyleId } from './styles';

/** Notes are scheduled this far ahead of the audio clock, so a busy frame can't make them late. */
const LOOKAHEAD = 0.15;
const TICK_MS = 25;

type NoteVoice = 'keys' | 'piano' | 'pad' | 'synth' | 'guitar' | 'lead' | 'pluck' | 'bell' | 'bass';

/** How hard notes drive the distortion, and how far its output is brought back down. */
const DRIVE_IN = 9, DRIVE_OUT = 0.11;

/** A soft-clipping curve: quiet notes pass, loud ones flatten into a guitar amp's crunch. */
function overdrive(amount: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
  }
  return curve;
}

/**
 * Lofi made live from oscillators and noise, ported from the prototype: drums,
 * bass, chords and a sparse melody over a reverb, with vinyl crackle.
 */
export class GeneratedMusic {
  private readonly input: GainNode;
  private readonly wet: GainNode;
  private readonly dry: GainNode;
  private readonly crackle: GainNode;
  /** Guitar notes go through this amp instead of straight in. */
  private readonly amp: GainNode;
  private style: MusicStyle | null = null;
  private timer = 0;
  private step = 0;
  private bar = 0;
  private nextTime = 0;
  private melodyLeft = 0;
  /** Semitones the whole piece is moved by, so each variation sits in its own key. */
  private transpose = 0;

  constructor(private readonly graph: AudioGraph, output: AudioNode) {
    const { ctx, noise } = graph;
    this.input = ctx.createGain();
    const tone = filter(ctx, 'lowpass', 3600, 0.5);
    const reverb = ctx.createConvolver();
    reverb.buffer = impulse(ctx, 2.8);
    this.wet = ctx.createGain();
    this.dry = ctx.createGain();
    this.input.connect(tone);
    tone.connect(this.dry);
    tone.connect(reverb);
    reverb.connect(this.wet);
    this.dry.connect(output);
    this.wet.connect(output);
    this.crackle = ctx.createGain();
    this.crackle.gain.value = 0;
    loop(ctx, noise.crackle, [filter(ctx, 'bandpass', 2500, 0.5)], this.crackle, 1);
    this.crackle.connect(output);
    this.amp = ctx.createGain();
    this.amp.gain.value = DRIVE_IN;
    const shaper = ctx.createWaveShaper();
    shaper.curve = overdrive(30);
    shaper.oversample = '2x';
    const cabinet = filter(ctx, 'lowpass', 3000, 0.7), level = ctx.createGain();
    level.gain.value = DRIVE_OUT;
    this.amp.connect(shaper);
    shaper.connect(cabinet);
    cabinet.connect(level);
    level.connect(this.input);
  }

  get playing(): boolean {
    return this.timer !== 0;
  }

  start(id: StyleId, transpose = 0): void {
    this.stop();
    this.transpose = transpose;
    const style = (this.style = STYLES[id]);
    this.wet.gain.value = style.wet;
    this.dry.gain.value = 1 - style.wet * 0.4;
    this.crackle.gain.value = style.crackle;
    this.step = this.bar = this.melodyLeft = 0;
    this.nextTime = this.graph.ctx.currentTime + LOOKAHEAD;
    this.timer = window.setInterval(() => this.schedule(), TICK_MS);
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = 0;
    this.crackle.gain.value = 0;
  }

  private schedule(): void {
    const style = this.style;
    if (!style) return;
    const stepLength = 60 / style.bpm / 4;
    while (this.nextTime < this.graph.ctx.currentTime + LOOKAHEAD) {
      const swing = this.step % 2 ? style.swing * stepLength : 0;
      this.playStep(style, this.step, this.nextTime + swing, stepLength);
      this.nextTime += stepLength;
      this.step++;
      if (this.step >= 16) {
        this.step = 0;
        this.bar++;
      }
    }
  }

  private playStep(st: MusicStyle, s: number, t: number, spb: number): void {
    const bars = st.chordBars ?? 1, chord = st.ch[Math.floor(this.bar / bars) % st.ch.length];
    const hit = (pattern: string): boolean => pattern[s] === 'x';
    const pad = st.voice === 'pad';
    if (st.chug && s % 2 === 0) {
      // Eighth notes, accented on the beat.
      chord.n.forEach(n => this.note('guitar', n, t, spb * 1.5, s % 4 === 0 ? 0.11 : 0.08));
    } else if (!st.chug && s === 0 && this.bar % bars === 0) {
      const length = spb * 16 * bars;
      chord.n.forEach((n, i) => this.note(st.voice, n, t + i * (pad ? 0 : 0.012 + Math.random() * 0.01), length * (pad ? 1.05 : 0.9), pad ? 0.07 : 0.1));
    }
    if (st.voice === 'keys' && s === 10 && Math.random() < 0.35) chord.n.slice(1).forEach(n => this.note('keys', n, t, spb * 5, 0.06));
    if (st.arp && s % 2 === 0) this.note('pluck', chord.n[(s / 2) % chord.n.length] + 12, t, spb * 1.8, 0.07);
    if (hit(st.bass)) {
      let n = chord.r;
      if (st.walk) n = [chord.r, chord.r + 4, chord.r + 7, chord.r + (Math.random() < 0.5 ? 10 : 11)][s / 4] ?? chord.r;
      else if (st.arp && s % 4 === 2) n = chord.r + 12;
      this.note('bass', n, t, st.walk ? spb * 3.6 : spb * (st.arp ? 1.6 : 6), st.arp ? 0.3 : 0.38);
    }
    if (hit(st.kick)) this.kick(t, st.brush ? 0.55 : 0.9);
    if (hit(st.snare)) {
      if (st.brush) this.noiseHit(t, 'bandpass', 3200, 0.6, 0.22, 0.28);
      else this.snare(t, st.voice === 'piano' ? 0.35 : 0.6);
    }
    if (hit(st.hat)) this.noiseHit(t, 'highpass', 7500, 0.8, (s % 4 === 0 ? 0.14 : 0.09) * (st.brush ? 0.8 : 1) * rand(0.7, 1.1), 0.045);
    if (st.mel && s % 2 === 0) {
      if (this.melodyLeft > 0) this.melodyLeft--;
      else if (Math.random() < st.mel) {
        const length = pick([2, 3, 4, 6]);
        this.melodyLeft = length / 2;
        this.note(st.chug ? 'lead' : pad ? 'bell' : st.voice === 'piano' ? 'piano' : 'keys', pick(st.scale), t, spb * length, st.chug ? 0.07 : 0.085);
      }
    }
  }

  private note(voice: NoteVoice, midi: number, t: number, dur: number, vel: number): void {
    const { ctx } = this.graph;
    const f = midiToHz(midi + this.transpose), g = ctx.createGain();
    // A slow wobble, like a tape that isn't quite steady.
    const wobble = Math.sin(t * 2.2) * 7;
    const oscillator = (type: OscillatorType, freq: number, gain: number, detune = 0): [OscillatorNode, GainNode] => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune + wobble;
      const og = ctx.createGain();
      og.gain.value = gain;
      o.connect(og);
      return [o, og];
    };
    let parts: [OscillatorNode, GainNode][] = [];
    const tone = filter(ctx, 'lowpass', 2400);
    let attack = 0.01, release = 0.4;
    if (voice === 'keys') {
      parts = [oscillator('sine', f, 1), oscillator('sine', f * 2, 0.18), oscillator('triangle', f, 0.2)];
      tone.frequency.value = 2000;
      release = 0.6;
    } else if (voice === 'piano') {
      parts = [oscillator('triangle', f, 0.8), oscillator('sine', f * 2, 0.25), oscillator('sine', f * 3, 0.06)];
      tone.frequency.value = 2600;
      release = 0.8;
      dur = Math.min(dur, 2.6);
    } else if (voice === 'pad') {
      parts = [oscillator('sawtooth', f, 0.35, -8), oscillator('sawtooth', f, 0.35, 8), oscillator('sine', f / 2, 0.4)];
      tone.frequency.value = 850;
      attack = 1.6;
      release = 3;
    } else if (voice === 'synth') {
      parts = [oscillator('sawtooth', f, 0.3, -6), oscillator('sawtooth', f, 0.3, 6)];
      tone.frequency.value = 1300;
      attack = 0.4;
      release = 1.2;
    } else if (voice === 'guitar') {
      parts = [oscillator('sawtooth', f, 0.5, -7), oscillator('sawtooth', f, 0.5, 7)];
      tone.frequency.value = 2200;
      release = 0.08;
    } else if (voice === 'lead') {
      parts = [oscillator('sawtooth', f, 0.5), oscillator('square', f * 2, 0.15)];
      tone.frequency.value = 2600;
      attack = 0.02;
      release = 0.5;
    } else if (voice === 'pluck') {
      parts = [oscillator('square', f, 0.3), oscillator('sawtooth', f, 0.2)];
      tone.frequency.setValueAtTime(3200, t);
      tone.frequency.exponentialRampToValueAtTime(400, t + 0.25);
      release = 0.2;
    } else if (voice === 'bell') {
      parts = [oscillator('sine', f, 0.7), oscillator('sine', f * 2.76, 0.12), oscillator('sine', f * 5.4, 0.04)];
      tone.frequency.value = 5000;
      release = 2.5;
      dur = 0.2;
    } else {
      parts = [oscillator('sine', f, 1), oscillator('triangle', f, 0.3)];
      tone.frequency.value = 500;
      release = 0.2;
    }
    for (const [, og] of parts) og.connect(tone);
    tone.connect(g);
    g.connect(voice === 'guitar' || voice === 'lead' ? this.amp : this.input);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + attack);
    if (voice === 'keys' || voice === 'piano' || voice === 'bell') g.gain.exponentialRampToValueAtTime(vel * 0.25, t + attack + Math.min(dur, 1.4));
    else g.gain.setValueAtTime(vel, t + Math.max(attack, dur - 0.05));
    g.gain.setTargetAtTime(0, t + dur, release / 3);
    const end = t + dur + release * 2;
    for (const [o] of parts) {
      o.start(t);
      o.stop(end);
    }
  }

  private kick(t: number, v: number): void {
    const { ctx } = this.graph;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    o.connect(g);
    g.connect(this.input);
    o.start(t);
    o.stop(t + 0.45);
  }

  private snare(t: number, v: number): void {
    this.noiseHit(t, 'highpass', 1400, 0.7, v * 0.5, 0.2);
    const { ctx } = this.graph;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = 185;
    g.gain.setValueAtTime(v * 0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(g);
    g.connect(this.input);
    o.start(t);
    o.stop(t + 0.12);
  }

  private noiseHit(t: number, type: BiquadFilterType, f: number, q: number, v: number, decay: number): void {
    const { ctx, noise } = this.graph;
    const s = ctx.createBufferSource();
    s.buffer = noise.white;
    const shape = filter(ctx, type, f, q), g = ctx.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    s.connect(shape);
    shape.connect(g);
    g.connect(this.input);
    s.start(t, Math.random() * 2);
    s.stop(t + decay + 0.05);
  }
}
