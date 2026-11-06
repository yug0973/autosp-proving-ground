/**
 * One address, two experiences. `index.html` holds both, and is the calm phone page as written: a small
 * script in its head turns it cinematic only on a screen at least 60rem wide that can draw WebGL, before
 * anything is painted. The choice holds for the visit: rotating a tablet or resizing a window does not
 * swap it, since that would mean building or tearing down the whole world part way through.
 *
 * The two share the message and the pilot form, not their design. The phone page explains AUTOSP in
 * words over one sky; the proof you can play with, and the city, are the cinematic page's.
 */
export function isLight(): boolean {
  return document.documentElement.dataset.experience !== 'cinematic';
}
