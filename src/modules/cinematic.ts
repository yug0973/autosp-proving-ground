/**
 * The cinematic experience: the proof's interactive steps, smooth scroll, the page's motion and the
 * world. All of it loads only when the page has been turned cinematic (lib/experience.ts), so the phone
 * page never downloads GSAP or three.js.
 */
import { initScroll } from './scroll';
import { initPick } from './pick';
import { initReproduce } from './reproduce';
import { initSandboxStep } from './sandbox-step';
import { initGatesStep } from './gates-step';
import { initMergeStep } from './merge-step';
import { initRecord } from './record';
import { initNumerals } from './numerals';
import { initRail } from './rail';
import { initApply } from './apply';
import { initReveal } from './reveal';
import { initHandoff } from './handoff';
import { initTracks } from './tracks';
import { initAnnotations } from './annotations';

export function initCinematic(): () => void {
  const cleanups: Array<() => void> = [initScroll(), initTracks()];
  const start = (selector: string, init: (element: HTMLElement) => () => void): void => {
    const element = document.querySelector<HTMLElement>(selector);
    if (element) cleanups.push(init(element));
  };
  start('[data-push]', initPick);
  start('[data-reproduce]', initReproduce);
  start('[data-sandbox]', initSandboxStep);
  start('[data-gates]', initGatesStep);
  start('[data-merge]', initMergeStep);
  start('[data-record]', initRecord);
  cleanups.push(initAnnotations());
  start('#results', initNumerals);
  start('[data-rail]', initRail);
  const form = document.querySelector<HTMLFormElement>('[data-apply]');
  if (form) cleanups.push(initApply(form));
  cleanups.push(initReveal(), initHandoff());
  // three.js is most of the page's script, so the world loads as its own chunk and the text
  // paints without waiting for it
  start('[data-world-stage]', (stage) => {
    let stop = (): void => {};
    void import('./world-stage').then(({ initWorldStage }) => {
      stop = initWorldStage(stage);
    });
    return () => {
      stop();
    };
  });
  return () => {
    while (cleanups.length > 0) cleanups.pop()?.();
  };
}
