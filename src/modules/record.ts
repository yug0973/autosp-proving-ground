/**
 * The record: the visitor's own fix written as a chain of five blocks. Each block's fingerprint is
 * SHA-256(previous fingerprint + entry), computed in the browser with Web Crypto, and the link
 * between two blocks carries the fingerprint of the one above into the one below.
 *
 * Editing any entry (by typing, or with "Rewrite entry 2", which makes the record claim the
 * reproduction test passed) changes that block's fingerprint, so the link below it carries a
 * different value and every later block stops matching: those blocks and links turn orange-red.
 * Restore puts the entries back. The entries follow the chosen finding, and the fifth (the merge)
 * is only written once the visitor has merged; until then it waits for a person, in amber. Each
 * entry wraps to show itself whole, and stays one line of text (Enter does not break it).
 *
 * Each fingerprint is a button: the short form shows, the full 64-character value appears on hover
 * or focus (a click keeps it open, Escape closes it), and its accessible name carries the full value.
 *
 * The HTML ships with the SQL injection record and its fingerprints already computed, for readers
 * without script.
 */
import { FIXES } from '../lib/fixes';
import { hashChain } from '../lib/sha256';
import { getFinding, isMerged, onFinding, onMerge } from '../lib/story';
import type { FindingId } from '../lib/story';

const SHORT = 4;
/** The entry the tamper demo rewrites (the reproduction), as an index. */
const TAMPERED = 1;
const PENDING_TEXT = 'Waiting for a person to merge';

function entries(id: FindingId): string[] {
  const fix = FIXES[id];
  const removed = fix.diff.filter((line) => line.kind === '-').length;
  const added = fix.diff.filter((line) => line.kind === '+').length;
  return [
    `Reported: ${id} in ${fix.file}`,
    `Reproduced: ${fix.test.name} failed`,
    `Patched in sandbox sbx-7f3a: ${String(removed)} ${removed === 1 ? 'line' : 'lines'} removed, ${String(added)} added`,
    'Verified: all three gates passed',
    'Merged by a person after an approving review',
  ];
}

interface Block {
  readonly el: HTMLElement;
  readonly input: HTMLTextAreaElement;
  readonly fingerprint: HTMLButtonElement;
  readonly short: HTMLElement;
  readonly head: HTMLElement;
  readonly tail: HTMLElement;
  readonly status: HTMLElement;
  /** The link above this block, carrying the previous fingerprint (none on the first). */
  readonly carry: HTMLElement | null;
}

type State = 'matches' | 'broken' | 'pending';

export function initRecord(root: HTMLElement): () => void {
  const restore = root.querySelector<HTMLButtonElement>('[data-record-restore]');
  const tamper = root.querySelector<HTMLButtonElement>('[data-record-tamper]');
  const live = root.querySelector<HTMLElement>('[data-record-live]');
  const blocks: Block[] = [];
  for (const el of root.querySelectorAll<HTMLElement>('[data-record-row]')) {
    const input = el.querySelector<HTMLTextAreaElement>('textarea');
    const fingerprint = el.querySelector<HTMLButtonElement>('[data-record-fp]');
    const short = el.querySelector<HTMLElement>('[data-record-short]');
    const [head, tail] = Array.from(el.querySelectorAll<HTMLElement>('[data-record-half]'));
    const status = el.querySelector<HTMLElement>('[data-record-status]');
    const carry = el.querySelector<HTMLElement>('[data-record-carry]');
    if (!input || !fingerprint || !short || !head || !tail || !status) return () => {};
    blocks.push({ el, input, fingerprint, short, head, tail, status, carry });
  }
  if (!restore || !tamper || !live || blocks.length !== 5) return () => {};

  let originals: string[] = [];
  let sealed: string[] = [];
  let written = 4; // how many entries exist: 4 before the merge, 5 after
  let token = 0;
  let disposed = false;

  const show = (hashes: readonly string[]): void => {
    const states: State[] = blocks.map((_, i) =>
      i >= written ? 'pending' : hashes[i] === sealed[i] ? 'matches' : 'broken',
    );
    blocks.forEach((block, i) => {
      const state = states[i] ?? 'pending';
      const full = state === 'pending' ? '' : (hashes[i] ?? '');
      const entry = String(i + 1);
      block.el.dataset.state = state;
      block.input.disabled = state === 'pending';
      block.input.setAttribute('aria-invalid', String(state === 'broken'));
      block.short.textContent = full ? full.slice(0, SHORT) : '----';
      block.head.textContent = full.slice(0, 32);
      block.tail.textContent = full.slice(32);
      block.fingerprint.disabled = !full;
      block.fingerprint.setAttribute(
        'aria-label',
        // the visible four characters first, so a voice command by what is on screen finds it
        full
          ? `${full.slice(0, SHORT)}, fingerprint of entry ${entry}: ${full}`
          : `----, entry ${entry} has no fingerprint yet`,
      );
      if (!full) delete block.fingerprint.dataset.pinned;
      block.status.textContent = state === 'broken' ? 'No longer matches' : '';
      if (block.carry) {
        // the link carries the fingerprint of the block above, in that block's state
        block.carry.textContent = (hashes[i - 1] ?? '----').slice(0, SHORT);
        block.carry.parentElement?.setAttribute('data-state', states[i - 1] ?? 'pending');
      }
    });
    const changed = states.includes('broken');
    restore.disabled = !changed;
    tamper.disabled = changed;
  };

  /** Each entry is one line of text that wraps to show itself whole: its box grows to fit it. */
  const fit = (): void => {
    for (const block of blocks) {
      block.input.style.height = 'auto';
      block.input.style.height = `${String(block.input.scrollHeight)}px`;
    }
  };

  /** Writes the record for the current finding and merge state, and seals it. */
  const reseal = async (): Promise<void> => {
    const mine = ++token;
    originals = entries(getFinding());
    written = isMerged() ? 5 : 4;
    blocks.forEach((block, i) => {
      block.input.value = i < written ? (originals[i] ?? '') : PENDING_TEXT;
    });
    fit();
    const hashes = await hashChain(originals.slice(0, written));
    if (disposed || mine !== token) return;
    sealed = hashes;
    root.dataset.chainVerified = 'true';
    show(hashes);
  };

  const refresh = async (changed: number): Promise<void> => {
    const mine = ++token;
    const hashes = await hashChain(blocks.slice(0, written).map((block) => block.input.value));
    if (disposed || mine !== token) return;
    show(hashes);
    const first = blocks.findIndex((block) => block.el.dataset.state === 'broken');
    const edited = `Edited entry ${String(changed + 1)}.`;
    live.textContent =
      first === -1
        ? 'Every entry matches again.'
        : first === written - 1
          ? `${edited} Entry ${String(written)} no longer matches the record.`
          : `${edited} Entries ${String(first + 1)} to ${String(written)} no longer match the record.`;
  };

  const handlers = blocks.map((block, i) => {
    const handler = (): void => {
      fit();
      void refresh(i);
    };
    block.input.addEventListener('input', handler);
    return handler;
  });
  // an entry is a single line: Enter does not break it
  const onEntryKey = (event: KeyboardEvent): void => {
    if (event.key === 'Enter') event.preventDefault();
  };
  for (const block of blocks) block.input.addEventListener('keydown', onEntryKey);
  const resize = new ResizeObserver(fit);
  resize.observe(root);

  // a fingerprint keeps its full value open on click; Escape or moving focus away closes it
  const onFingerprintClick = (event: Event): void => {
    const button = event.currentTarget as HTMLButtonElement;
    const pinned = button.dataset.pinned === 'true';
    for (const block of blocks) delete block.fingerprint.dataset.pinned;
    if (!pinned) button.dataset.pinned = 'true';
  };
  const onFingerprintKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') delete (event.currentTarget as HTMLButtonElement).dataset.pinned;
  };
  const onFingerprintBlur = (event: FocusEvent): void => {
    delete (event.currentTarget as HTMLButtonElement).dataset.pinned;
  };
  for (const block of blocks) {
    block.fingerprint.addEventListener('click', onFingerprintClick);
    block.fingerprint.addEventListener('keydown', onFingerprintKey);
    block.fingerprint.addEventListener('blur', onFingerprintBlur);
  }

  // the tamper demo: rewrite the reproduction to claim the test passed
  const onTamper = (): void => {
    const block = blocks[TAMPERED];
    if (!block) return;
    block.input.value = block.input.value.replace(/ failed$/, ' passed');
    fit();
    void refresh(TAMPERED);
    restore.focus();
  };
  const onRestore = (): void => {
    void reseal().then(() => {
      live.textContent = 'Record restored. Every entry matches again.';
    });
    tamper.focus();
  };
  tamper.addEventListener('click', onTamper);
  restore.addEventListener('click', onRestore);
  const stops = [
    onFinding(() => {
      void reseal();
    }),
    onMerge(() => {
      void reseal();
    }),
  ];
  void reseal();

  return () => {
    disposed = true;
    resize.disconnect();
    for (const stop of stops) stop();
    blocks.forEach((block, i) => {
      const handler = handlers[i];
      if (handler) block.input.removeEventListener('input', handler);
      block.input.removeEventListener('keydown', onEntryKey);
      block.fingerprint.removeEventListener('click', onFingerprintClick);
      block.fingerprint.removeEventListener('keydown', onFingerprintKey);
      block.fingerprint.removeEventListener('blur', onFingerprintBlur);
    });
    tamper.removeEventListener('click', onTamper);
    restore.removeEventListener('click', onRestore);
  };
}
