/**
 * Each room has one orchestrated moment. It plays once, when the room has come well into view, and then
 * stops; nothing of it runs while the room is off screen. In quiet mode a room shows its final state at
 * once and its demos still answer the visitor.
 */
export function onceInView(room: Element, play: () => void): () => void {
  // once its top is 70% of the way down the screen, whatever its height (a phone's rooms are tall)
  const watch = new IntersectionObserver(
    ([entry]) => {
      if (!entry?.isIntersecting) return;
      watch.disconnect();
      play();
    },
    { rootMargin: '0px 0px -30% 0px', threshold: 0 },
  );
  watch.observe(room);
  return () => {
    watch.disconnect();
  };
}

/** A queue of timed steps that can be finished at once (skip, quiet mode) or cancelled. */
export function timeline(): {
  at: (ms: number, step: () => void) => void;
  finish: () => void;
  cancel: () => void;
} {
  const steps: Array<{ ms: number; step: () => void; timer: number; done: boolean }> = [];
  return {
    at(ms, step) {
      const entry = { ms, step, timer: 0, done: false };
      entry.timer = window.setTimeout(() => {
        entry.done = true;
        step();
      }, ms);
      steps.push(entry);
    },
    finish() {
      for (const entry of steps) {
        if (entry.done) continue;
        window.clearTimeout(entry.timer);
        entry.done = true;
        entry.step();
      }
    },
    cancel() {
      for (const entry of steps) window.clearTimeout(entry.timer);
      steps.length = 0;
    },
  };
}
