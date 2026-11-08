/**
 * Room 5, the Guestbook: the audit trail as entries in ink, each carrying the SHA-256 fingerprint of
 * everything before it (sha256(previous fingerprint + entry)), computed here in the browser. The page
 * prints the sealed fingerprints; this recomputes them and checks they match before taking over.
 *
 * "Tamper with entry 2" rewrites the reproduction to claim the test passed. Every fingerprint from there
 * on is recomputed and no longer matches what was sealed: its ink bleeds and runs, once (an SVG
 * turbulence filter, removed when it settles), and it stays marked. "Restore the record" dries it back.
 * Entry 5 is written when a person signs in Room 6 (the 'exhibit:signed' event). A live region says what
 * happened. In quiet mode the ink changes without running.
 */
import { hashChain } from '../lib/sha256';

const TAMPERED = 1;
const BLEED_MS = 900;
const SIGNED_TEXT = 'Merged by a person: pull request #412';

interface Entry {
  readonly el: HTMLElement;
  readonly text: HTMLElement;
  readonly fp: HTMLElement;
  readonly state: HTMLElement;
  readonly original: string;
  sealed: string;
}

export function initGuestbook(room: HTMLElement, quiet: boolean): () => void {
  const list = room.querySelector<HTMLElement>('[data-guestbook]');
  const tamper = room.querySelector<HTMLButtonElement>('[data-tamper]');
  const restore = room.querySelector<HTMLButtonElement>('[data-restore]');
  const status = room.querySelector<HTMLElement>('[data-guestbook-status]');
  const bleed = document.querySelector<SVGElement>('[data-bleed]');
  if (!list || !tamper || !restore || !status || !('subtle' in crypto)) return () => {};
  const entries: Entry[] = Array.from(list.querySelectorAll<HTMLElement>('[data-entry]')).flatMap((el) => {
    const text = el.querySelector<HTMLElement>('[data-entry-text]');
    const fp = el.querySelector<HTMLElement>('[data-entry-fp]');
    const state = el.querySelector<HTMLElement>('[data-entry-state]');
    if (!text || !fp || !state) return [];
    return [{ el, text, fp, state, original: text.textContent.trim(), sealed: fp.textContent.trim() }];
  });
  const last = entries[4];
  if (entries.length !== 5 || !last) return () => {};
  const pendingText = last.original;
  const pendingFp = last.sealed;
  let signed = false;
  let token = 0;
  let frame = 0;

  /** The entries the record holds now: the fifth only once a person has signed. */
  const written = (): Entry[] => (signed ? entries : entries.slice(0, 4));

  /** Runs the ink of `which` once, then takes the filter away again. */
  const run = (which: readonly Entry[]): void => {
    if (quiet || !bleed || which.length === 0) return;
    cancelAnimationFrame(frame);
    for (const e of which) e.fp.style.filter = 'url(#ink-bleed)';
    const start = performance.now();
    const step = (now: number): void => {
      const t = Math.min((now - start) / BLEED_MS, 1);
      // spreads fast, then settles part way back, as wet ink does
      const scale = t < 0.45 ? (t / 0.45) * 9 : 9 - ((t - 0.45) / 0.55) * 9;
      bleed.setAttribute('scale', scale.toFixed(2));
      if (t < 1) {
        frame = requestAnimationFrame(step);
        return;
      }
      bleed.setAttribute('scale', '0');
      for (const e of which) e.fp.style.removeProperty('filter');
    };
    frame = requestAnimationFrame(step);
  };

  /** Recomputes the chain from the entries as written and marks every fingerprint that no longer matches. */
  const refresh = async (): Promise<Entry[]> => {
    const mine = (token += 1);
    const now = written();
    const hashes = await hashChain(now.map((e) => e.text.textContent.trim()));
    if (mine !== token) return [];
    const newlyBroken: Entry[] = [];
    now.forEach((e, i) => {
      const hash = hashes[i] ?? '';
      const broken = hash !== e.sealed;
      if (broken && !e.el.hasAttribute('data-broken')) newlyBroken.push(e);
      e.fp.textContent = hash;
      e.el.toggleAttribute('data-broken', broken);
      e.state.textContent = broken ? 'No longer matches' : 'Sealed';
    });
    return newlyBroken;
  };

  const onTamper = (): void => {
    const entry = entries[TAMPERED];
    if (!entry) return;
    entry.text.textContent = entry.original.replace(/ failed$/, ' passed');
    entry.el.setAttribute('data-rewritten', '');
    tamper.disabled = true;
    restore.disabled = false;
    void refresh().then((broken) => {
      run(broken);
      status.textContent = `Entry 2 was rewritten to say the test passed. ${String(broken.length)} fingerprints no longer match, from entry 2 on.`;
      restore.focus();
    });
  };
  const onRestore = (): void => {
    for (const e of written()) e.text.textContent = e === last ? SIGNED_TEXT : e.original;
    entries[TAMPERED]?.el.removeAttribute('data-rewritten');
    tamper.disabled = false;
    restore.disabled = true;
    void refresh().then(() => {
      status.textContent = 'The record is restored. Every fingerprint matches again.';
      tamper.focus();
    });
  };

  // a person signed (or the demo signing was undone): entry 5 is written, or waits again
  const onSigned = (event: Event): void => {
    signed = (event as CustomEvent<boolean>).detail;
    if (signed) {
      last.text.textContent = SIGNED_TEXT;
      last.el.removeAttribute('data-pending');
      // what entry 5 is sealed as: its fingerprint on the record as it was written, untampered
      void hashChain([...entries.slice(0, 4).map((e) => e.original), SIGNED_TEXT]).then((sealed) => {
        last.sealed = sealed[4] ?? '';
        void refresh().then((broken) => {
          run(broken);
        });
      });
    } else {
      last.text.textContent = pendingText;
      last.fp.textContent = pendingFp;
      last.state.textContent = '';
      last.el.setAttribute('data-pending', '');
      last.el.removeAttribute('data-broken');
    }
  };

  // the printed fingerprints are checked against the chain before the room takes over
  void refresh();
  tamper.addEventListener('click', onTamper);
  restore.addEventListener('click', onRestore);
  document.addEventListener('exhibit:signed', onSigned);
  return () => {
    cancelAnimationFrame(frame);
    tamper.removeEventListener('click', onTamper);
    restore.removeEventListener('click', onRestore);
    document.removeEventListener('exhibit:signed', onSigned);
  };
}
