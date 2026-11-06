/**
 * Entry point. Styles load in layer order, then whichever experience this visit has
 * (lib/experience.ts) loads as its own chunk. Each returns its own cleanup, run on hot reload during
 * development.
 */
import './styles/world-tokens.css';
import './styles/base.css';
import './styles/world.css';
import './styles/annotations.css';
import './styles/light.css';
import { isLight } from './lib/experience';

let cleanup: (() => void) | null = null;

// what only works with script (the hold to merge) stays hidden without it
document.documentElement.dataset.js = '';

if (isLight()) {
  void import('./modules/light').then(({ initLight }) => {
    cleanup = initLight();
  });
} else {
  void import('./modules/cinematic').then(({ initCinematic }) => {
    cleanup = initCinematic();
  });
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cleanup?.();
  });
}
