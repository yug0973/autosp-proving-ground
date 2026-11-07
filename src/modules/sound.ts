/**
 * Optional sound (the roadmap's Phase 9): a low city hum, a small tick when the pointer finds a crack,
 * and a soft chime when a person merges. Off by default; the button in the top strip turns it on, and
 * the choice is remembered in this browser. All of it is made with Web Audio: no files to load. A
 * browser lets sound start only after a gesture, so a remembered "on" waits for the first click or key.
 */
import { onMerge } from '../lib/story';

const KEY = 'autosp-sound';

function remembered(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}
function remember(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // private windows and blocked storage: the choice simply lasts this visit
  }
}

interface Voice {
  context: AudioContext;
  out: GainNode;
}

/** The hum: two low tones and a little filtered noise, under a gain that fades in and out. */
function startHum(context: AudioContext, out: GainNode): () => void {
  const bed = context.createGain();
  bed.gain.value = 0;
  bed.gain.linearRampToValueAtTime(1, context.currentTime + 1.5);
  const low = context.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 220;
  low.connect(bed);
  bed.connect(out);
  const tones = [55, 82.5].map((frequency, i) => {
    const tone = context.createOscillator();
    tone.type = i === 0 ? 'sine' : 'triangle';
    tone.frequency.value = frequency;
    const level = context.createGain();
    level.gain.value = i === 0 ? 0.05 : 0.02;
    tone.connect(level).connect(low);
    tone.start();
    return tone;
  });
  // brown noise: the city's far traffic
  const length = context.sampleRate * 2;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i += 1) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  const noise = context.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;
  const noiseLevel = context.createGain();
  noiseLevel.gain.value = 0.05;
  noise.connect(noiseLevel).connect(low);
  noise.start();
  return () => {
    bed.gain.cancelScheduledValues(context.currentTime);
    bed.gain.setValueAtTime(bed.gain.value, context.currentTime);
    bed.gain.linearRampToValueAtTime(0, context.currentTime + 0.4);
    const end = context.currentTime + 0.45;
    for (const tone of tones) tone.stop(end);
    noise.stop(end);
  };
}

function blip(voice: Voice, frequency: number, level: number, length: number, start = 0): void {
  const { context, out } = voice;
  const at = context.currentTime + start;
  const tone = context.createOscillator();
  tone.type = 'sine';
  tone.frequency.value = frequency;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(level, at + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  tone.connect(gain).connect(out);
  tone.start(at);
  tone.stop(at + length + 0.05);
}

export function initSound(button: HTMLButtonElement): () => void {
  if (!('AudioContext' in window)) return () => {};
  let voice: Voice | null = null;
  let stopHum: (() => void) | null = null;
  let on = false;

  const show = (): void => {
    button.setAttribute('aria-pressed', String(on));
    button.textContent = on ? 'Sound on' : 'Sound off';
  };
  const ensure = (): Voice => {
    if (!voice) {
      const context = new AudioContext();
      const out = context.createGain();
      out.gain.value = 0.6;
      out.connect(context.destination);
      voice = { context, out };
    }
    return voice;
  };
  const play = (): void => {
    const v = ensure();
    void v.context.resume();
    stopHum ??= startHum(v.context, v.out);
  };
  const quiet = (): void => {
    stopHum?.();
    stopHum = null;
  };
  const set = (next: boolean): void => {
    on = next;
    remember(on);
    show();
    if (on) play();
    else quiet();
  };

  const onToggle = (): void => {
    set(!on);
  };
  // a remembered "on" starts with the first gesture, as browsers require
  const onFirstGesture = (): void => {
    if (on && !stopHum) play();
  };
  const onHover = (): void => {
    if (on && voice) blip(voice, 1900, 0.035, 0.05);
  };
  const stopMerge = onMerge((merged) => {
    if (!on || !voice || !merged) return;
    blip(voice, 659.25, 0.07, 1.4);
    blip(voice, 987.77, 0.05, 1.6, 0.09);
  });
  const onVisibility = (): void => {
    if (!voice) return;
    if (document.hidden) void voice.context.suspend();
    else if (on) void voice.context.resume();
  };

  on = remembered();
  show();
  button.hidden = false;
  button.addEventListener('click', onToggle);
  window.addEventListener('pointerdown', onFirstGesture, { once: true });
  window.addEventListener('keydown', onFirstGesture, { once: true });
  window.addEventListener('crack:hover', onHover);
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    button.removeEventListener('click', onToggle);
    window.removeEventListener('pointerdown', onFirstGesture);
    window.removeEventListener('keydown', onFirstGesture);
    window.removeEventListener('crack:hover', onHover);
    document.removeEventListener('visibilitychange', onVisibility);
    stopMerge();
    quiet();
    void voice?.context.close();
    button.hidden = true;
  };
}
