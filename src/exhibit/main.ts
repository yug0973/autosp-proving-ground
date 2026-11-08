/**
 * One Fix, the exhibition. The route line, the amber dot and the walls (route.ts), quiet mode (quiet.ts),
 * and each room's moment: the Proof (proof.ts), the Clean Room (clean-room.ts), the Gates (gates.ts), the
 * Guestbook (guestbook.ts) and the Signing (signing.ts); the RSVP form (rsvp.ts), the phone's apply bar
 * (apply-bar.ts) and the parts that wait for their facts (site.ts).
 */
import './exhibit.css';
import { isQuiet } from './quiet';
import { initRoute } from './route';
import { initProof } from './proof';
import { initCleanRoom } from './clean-room';
import { initGates } from './gates';
import { initGuestbook } from './guestbook';
import { initSigning } from './signing';
import { initRsvp } from './rsvp';
import { initApplyBar } from './apply-bar';
import { applySite } from './site';

// the parts whose facts have been given go in first, so every room below sees its final shape
applySite();
const quiet = isQuiet();
document.documentElement.toggleAttribute('data-quiet', quiet);
const room = (id: string): HTMLElement | null => document.getElementById(id);
const rooms: Array<[string, (el: HTMLElement) => () => void]> = [
  ['proof', (el) => initProof(el, quiet)],
  ['clean-room', (el) => initCleanRoom(el, quiet)],
  ['gates', (el) => initGates(el, quiet)],
  ['guestbook', (el) => initGuestbook(el, quiet)],
  ['signing', (el) => initSigning(el)],
];
for (const [id, init] of rooms) {
  const el = room(id);
  if (el) init(el);
}
const form = document.querySelector<HTMLFormElement>('[data-rsvp]');
if (form) initRsvp(form);
const bar = document.querySelector<HTMLElement>('[data-apply-bar]');
if (bar) initApplyBar(bar);
// the route is laid out last, once the rooms have taken their final shape
initRoute(quiet);
