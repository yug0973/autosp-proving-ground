/**
 * The three UI sounds (DESIGN.md §7): exploit hit, check pass and merge. Each is synthesised with
 * the Web Audio API (no audio files), lasts under 300 ms and is levelled under -18 LUFS; the
 * levels are measured offline by tests/module2.py through `renderSound`.
 *
 * This module never checks the visitor's preference: callers play a sound only when the nav's
 * sound toggle is on (`isSoundOn()` in modules/nav.ts). The AudioContext is created on the first
 * play, which always follows a click or key press, so browsers allow it to start.
 */

export type SoundName = 'exploit' | 'pass' | 'merge';

type Recipe = (ctx: BaseAudioContext, out: AudioNode, t0: number) => void;

/** Every recipe ends by this time, in seconds (the §7 limit is 0.3 s). */
export const SOUND_LENGTH_S = 0.28;

function envelope(
  ctx: BaseAudioContext,
  out: AudioNode,
  t0: number,
  peak: number,
  attack: number,
  end: number,
): GainNode {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + end);
  gain.connect(out);
  return gain;
}

const RECIPES: Record<SoundName, Recipe> = {
  // a short, falling buzz: something got through
  exploit(ctx, out, t0) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, t0);
    filter.connect(envelope(ctx, out, t0, 0.16, 0.006, 0.22));
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(196, t0);
    osc.frequency.exponentialRampToValueAtTime(92, t0 + 0.2);
    osc.connect(filter);
    osc.start(t0);
    osc.stop(t0 + 0.23);
  },
  // two quick rising notes: a check passed
  pass(ctx, out, t0) {
    for (const [offset, freq] of [
      [0, 660],
      [0.08, 990],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t0 + offset);
      osc.connect(envelope(ctx, out, t0 + offset, 0.14, 0.005, 0.12));
      osc.start(t0 + offset);
      osc.stop(t0 + offset + 0.13);
    }
  },
  // a soft major chord: merged
  merge(ctx, out, t0) {
    for (const freq of [523.25, 659.25, 783.99]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      osc.connect(envelope(ctx, out, t0, 0.07, 0.01, 0.27));
      osc.start(t0);
      osc.stop(t0 + SOUND_LENGTH_S);
    }
  },
};

let liveContext: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof AudioContext !== 'function') return null;
  liveContext ??= new AudioContext();
  if (liveContext.state === 'suspended') void liveContext.resume();
  return liveContext;
}

/** Plays a sound now. Call only after a visitor gesture and only when sound is on. */
export function playSound(name: SoundName): void {
  const ctx = context();
  if (!ctx) return;
  RECIPES[name](ctx, ctx.destination, ctx.currentTime + 0.01);
}

/** Renders a sound offline, for measuring its length and loudness. Mono, at `sampleRate`. */
export async function renderSound(name: SoundName, sampleRate = 48000): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, Math.ceil(sampleRate * SOUND_LENGTH_S), sampleRate);
  RECIPES[name](ctx, ctx.destination, 0);
  const buffer = await ctx.startRendering();
  return buffer.getChannelData(0);
}
