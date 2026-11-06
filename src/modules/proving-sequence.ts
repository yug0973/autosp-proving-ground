/**
 * The proving sequence (DESIGN.md §6.2): one finding's journey from reported to approved, pinned and
 * scrubbed by scroll, fully reversible. This is the page's one memorable element.
 *
 * The static HTML is the five stages stacked at their final states (the no-JS, reduced-motion and
 * short-viewport version). When the page can animate, this module reorganises that DOM into a pinned
 * frame and drives one GSAP timeline from a scrubbed ScrollTrigger: the code morphs from the
 * vulnerable line to the parameterized query, the stage artifacts cross-fade, and the rail fills.
 * Everything is set from timeline progress, so scrubbing up restores earlier states exactly.
 *
 * Keyboard users step the same states through Previous/Next stage; Skip animation jumps past the pin.
 * The animated build is created and torn down live as reduced-motion or the viewport height changes.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { createCodeMorph, type CodeMorph } from '../lib/code-morph';
import { prefersReducedMotion, onReducedMotionChange } from '../lib/reduced-motion';
import { getLenis } from './scroll';

/** The animated pin needs a viewport at least this tall (§6.2) and this wide: its two-column pinned
 *  frame is designed for desktop, so narrow and short screens get the static stacked version. */
const MIN_HEIGHT = 700;
const MIN_WIDTH = 896; /* 56rem, where the rest of the layout collapses to one column */
const STAGE_COUNT = 5;

/** Reads a panel <pre>'s code as an array of lines. */
function codeLines(pre: HTMLElement | null): string[] {
  const code = pre?.querySelector('code');
  return (code?.textContent ?? '').replace(/\n$/, '').split('\n');
}

interface Animated {
  destroy(): void;
}

function buildAnimated(section: HTMLElement): Animated | null {
  const pin = section.querySelector<HTMLElement>('[data-proving-pin]');
  const figure = section.querySelector<HTMLElement>('[data-proving-code]');
  const beforePre = section.querySelector<HTMLElement>('[data-code-before]');
  const afterPre = section.querySelector<HTMLElement>('[data-code-after]');
  const stages = Array.from(section.querySelectorAll<HTMLElement>('[data-proving-stages] > .proving__stage'));
  const railItems = Array.from(
    section.querySelectorAll<HTMLElement>('[data-proving-rail] .proving__rail-item'),
  );
  const controls = section.querySelector<HTMLElement>('[data-proving-controls]');
  const counter = section.querySelector<HTMLElement>('[data-stage-counter]');
  const prevBtn = section.querySelector<HTMLButtonElement>('[data-stage-prev]');
  const nextBtn = section.querySelector<HTMLButtonElement>('[data-stage-next]');
  const skip = section.querySelector<HTMLAnchorElement>('[data-skip-animation]');
  if (
    !pin ||
    !figure ||
    !beforePre ||
    !afterPre ||
    stages.length !== STAGE_COUNT ||
    railItems.length !== STAGE_COUNT ||
    !controls
  ) {
    return null;
  }

  // the code morph replaces the two static <pre>s
  const morph: CodeMorph = createCodeMorph(codeLines(beforePre), codeLines(afterPre));
  const wave = document.createElement('span');
  wave.className = 'morph__wave';
  wave.setAttribute('aria-hidden', 'true');
  morph.element.append(wave);
  beforePre.hidden = true;
  afterPre.hidden = true;
  figure.append(morph.element);
  section.classList.add('proving--animated');
  controls.hidden = false;

  const names = railItems.map((item) => item.querySelector('.proving__name')?.textContent ?? '');
  let current = -1;
  const setCurrent = (index: number): void => {
    if (index === current) return;
    current = index;
    railItems.forEach((item, i) => {
      item.dataset.state = i < index ? 'done' : i === index ? 'current' : 'ahead';
    });
    if (counter)
      counter.textContent = `Stage ${String(index + 1)} of ${String(STAGE_COUNT)}: ${names[index] ?? ''}`;
  };

  gsap.set(stages, { opacity: (i: number) => (i === 0 ? 1 : 0) });
  morph.showBefore();
  gsap.set(wave, { opacity: 1 });
  setCurrent(0);

  // one timeline, five units; cross-fades in the first 0.4 of each unit, the morph at unit 2 (Patched)
  const tl = gsap.timeline({ paused: true });
  for (let k = 1; k < STAGE_COUNT; k += 1) {
    tl.to(stages[k - 1] ?? {}, { opacity: 0, duration: 0.4, ease: 'none' }, k);
    tl.to(stages[k] ?? {}, { opacity: 1, duration: 0.4, ease: 'none' }, k);
  }
  // stage 3 (Patched) is index 2. The morph runs entering unit 2 and finishes before its centre
  // (t = 2.5). Old glyphs fade out first, then new ones type in, so dissimilar lines never overlap.
  tl.to(wave, { opacity: 0, duration: 0.2, ease: 'none' }, 1.95);
  tl.to(
    morph.removed,
    {
      opacity: 0,
      duration: 0.2,
      ease: 'none',
      stagger: { each: 0.1 / Math.max(1, morph.removed.length), from: 'start' },
    },
    1.95,
  );
  tl.to(
    morph.added,
    {
      opacity: 1,
      duration: 0.25,
      ease: 'none',
      stagger: { each: 0.1 / Math.max(1, morph.added.length), from: 'start' },
    },
    2.15,
  );
  tl.set({}, {}, STAGE_COUNT); // hold the end at t = 5

  const trigger = ScrollTrigger.create({
    animation: tl,
    trigger: section,
    start: 'top top',
    end: 'bottom bottom',
    pin,
    pinSpacing: true,
    anticipatePin: 1,
    scrub: 0.6,
    invalidateOnRefresh: true,
    onUpdate: (self) => {
      setCurrent(Math.min(STAGE_COUNT - 1, Math.floor(self.progress * STAGE_COUNT)));
    },
  });

  const goToStage = (index: number): void => {
    const clamped = Math.max(0, Math.min(STAGE_COUNT - 1, index));
    const progress = (clamped + 0.5) / STAGE_COUNT;
    const y = trigger.start + progress * (trigger.end - trigger.start);
    const lenis = getLenis();
    if (lenis) lenis.scrollTo(y);
    else window.scrollTo({ top: y, behavior: 'auto' });
  };
  const onPrev = (): void => {
    goToStage(current - 1);
  };
  const onNext = (): void => {
    goToStage(current + 1);
  };
  const onSkip = (event: MouseEvent): void => {
    const target = skip && document.getElementById(decodeURIComponent(skip.hash.slice(1)));
    if (target) return; // a real next section exists: let scroll.ts handle the anchor
    event.preventDefault();
    const y = trigger.end + 1;
    const lenis = getLenis();
    if (lenis) lenis.scrollTo(y, { immediate: true });
    else window.scrollTo({ top: y, behavior: 'auto' });
  };
  prevBtn?.addEventListener('click', onPrev);
  nextBtn?.addEventListener('click', onNext);
  skip?.addEventListener('click', onSkip);

  return {
    destroy() {
      prevBtn?.removeEventListener('click', onPrev);
      nextBtn?.removeEventListener('click', onNext);
      skip?.removeEventListener('click', onSkip);
      trigger.kill(); // reverts the pin spacer
      tl.kill();
      gsap.set(stages, { clearProps: 'opacity' });
      railItems.forEach((item) => delete item.dataset.state);
      morph.element.remove();
      beforePre.hidden = false;
      afterPre.hidden = false;
      controls.hidden = true;
      section.classList.remove('proving--animated');
      current = -1;
    },
  };
}

/** Starts the proving sequence. Returns a function that tears down the animated build and watchers. */
export function initProvingSequence(section: HTMLElement): () => void {
  let animated: Animated | null = null;

  const wanted = (): boolean =>
    !prefersReducedMotion() && window.innerHeight >= MIN_HEIGHT && window.innerWidth >= MIN_WIDTH;
  const sync = (): void => {
    const want = wanted();
    if (want && !animated) animated = buildAnimated(section);
    else if (!want && animated) {
      animated.destroy();
      animated = null;
    }
  };

  sync();
  let resizeFrame = 0;
  const onResize = (): void => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(sync);
  };
  window.addEventListener('resize', onResize, { passive: true });
  const stopWatching = onReducedMotionChange(sync);

  return () => {
    cancelAnimationFrame(resizeFrame);
    window.removeEventListener('resize', onResize);
    stopWatching();
    animated?.destroy();
    animated = null;
  };
}
