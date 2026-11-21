/**
 * The arrival from Nexarise: a visitor who comes from a Nexarise page (its address as the referrer,
 * or an explicit `?from=nexarise`) spends about a second on a bright cloud sky, AUTOSP's own, with a
 * touch of the Nexarise blue, before it settles into the hero's view, so the two pages feel like one
 * world. It is not a copy of the Nexarise page.
 *
 * It plays once a session, and never with reduced motion. It is only ever the picture behind the
 * page: the headline and the pilot button appear on their own time and work throughout, and scrolling
 * simply takes over from it. The note that it has played lives in sessionStorage; if that is empty or
 * unavailable the page still renders, and at worst the visitor sees the arrival again.
 */
import { prefersReducedMotion } from '../lib/reduced-motion';

/** The hosts that count as Nexarise, besides this page's own. */
const NEXARISE_HOSTS: readonly string[] = ['nexarise.site', 'www.nexarise.site', 'nexarise-website.vercel.app'];
const KEY = 'autosp.arrival-shown';

function fromNexarise(): boolean {
  if (new URLSearchParams(window.location.search).get('from') === 'nexarise') return true;
  if (!document.referrer) return false;
  try {
    const referrer = new URL(document.referrer);
    // this page itself, reloaded or linked to, is not an arrival
    if (referrer.pathname === window.location.pathname && referrer.host === window.location.host)
      return false;
    return referrer.host === window.location.host || NEXARISE_HOSTS.includes(referrer.host);
  } catch {
    return false;
  }
}

function alreadyShown(): boolean {
  try {
    return window.sessionStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

function noteShown(): void {
  try {
    window.sessionStorage.setItem(KEY, '1');
  } catch {
    // no storage: nothing to remember it in, which does no harm
  }
}

/**
 * Whether this visit starts with the arrival; asking says yes once. Not when the page has opened
 * partway down, where the sky is not on screen.
 */
export function claimArrival(): boolean {
  if (prefersReducedMotion() || window.scrollY > 4 || !fromNexarise() || alreadyShown()) return false;
  noteShown();
  return true;
}
