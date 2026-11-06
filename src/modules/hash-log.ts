/**
 * The hash-chain log (DESIGN.md §6.5): five record blocks whose hashes chain together. Editing any
 * block recomputes its hash and every hash after it; a block whose hash no longer equals its sealed
 * original turns open-red and reads "No longer matches." Restore reseals the chain. This makes the
 * append-only, tamper-evident record something the visitor can break with their own hands.
 *
 * The blocks, their payloads and their original short hashes are in the HTML, so the sealed chain is
 * readable without JavaScript. On load this module recomputes the chain and checks it against those
 * baked hashes, then takes over: recomputing live, marking broken blocks, and announcing changes.
 */
import { hashChain } from '../lib/sha256';

interface Block {
  readonly el: HTMLElement;
  readonly input: HTMLInputElement;
  readonly shortEl: HTMLElement;
  readonly fullEl: HTMLElement;
  readonly statusEl: HTMLElement;
  readonly original: string;
  readonly sealedShort: string;
}

const SHORT_LEN = 4;

function readBlocks(root: HTMLElement): Block[] | null {
  const blocks: Block[] = [];
  for (const el of root.querySelectorAll<HTMLElement>('[data-log-block]')) {
    const input = el.querySelector<HTMLInputElement>('[data-log-input]');
    const shortEl = el.querySelector<HTMLElement>('[data-log-short]');
    const fullEl = el.querySelector<HTMLElement>('[data-log-full]');
    const statusEl = el.querySelector<HTMLElement>('[data-log-status]');
    if (!input || !shortEl || !fullEl || !statusEl) return null;
    blocks.push({
      el,
      input,
      shortEl,
      fullEl,
      statusEl,
      original: input.value,
      sealedShort: shortEl.textContent.trim(),
    });
  }
  return blocks.length > 0 ? blocks : null;
}

export function initHashLog(root: HTMLElement): () => void {
  const blocks = readBlocks(root);
  const restore = root.querySelector<HTMLButtonElement>('[data-log-restore]');
  const live = root.querySelector<HTMLElement>('[data-log-live]');
  const hashButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-log-hash]'));
  if (!blocks || !restore || !live) return () => {};

  let disposed = false;
  let token = 0;

  const setBroken = (block: Block, broken: boolean): void => {
    block.el.dataset.broken = String(broken);
    block.statusEl.textContent = broken ? 'No longer matches' : 'Sealed';
    block.input.setAttribute('aria-invalid', String(broken));
  };

  const announce = (message: string): void => {
    live.textContent = message;
  };

  const refresh = async (changedIndex: number | null): Promise<void> => {
    const mine = ++token;
    const hashes = await hashChain(blocks.map((b) => b.input.value));
    if (disposed || mine !== token) return; // a newer edit superseded this run
    blocks.forEach((block, i) => {
      const full = hashes[i] ?? '';
      const short = full.slice(0, SHORT_LEN);
      block.shortEl.textContent = short;
      block.fullEl.textContent = full;
      setBroken(block, short !== block.sealedShort || block.input.value !== block.original);
    });
    const firstBroken = blocks.findIndex((b) => b.el.dataset.broken === 'true');
    const last = blocks.length;
    restore.disabled = firstBroken === -1;
    if (changedIndex !== null) {
      if (firstBroken === -1) {
        announce('Record restored. All five blocks match again.');
      } else {
        const range =
          firstBroken === last - 1
            ? `Block ${String(last)} no longer matches`
            : `Blocks ${String(firstBroken + 1)} to ${String(last)} no longer match`;
        announce(`Edited block ${String(changedIndex + 1)}. ${range} the sealed record.`);
      }
    }
  };

  const onInput = (index: number) => (): void => {
    void refresh(index);
  };
  const inputHandlers = blocks.map((block, i) => {
    const handler = onInput(i);
    block.input.addEventListener('input', handler);
    return { input: block.input, handler };
  });

  const onRestore = (): void => {
    for (const block of blocks) block.input.value = block.original;
    void refresh(null);
    announce('Record restored. All five blocks match again.');
    blocks[0]?.input.focus();
  };
  restore.addEventListener('click', onRestore);

  // click a hash to keep its full value shown (hover and focus reveal it via CSS)
  const hashToggles = hashButtons.map((button) => {
    const handler = (): void => {
      button.dataset.shown = button.dataset.shown === 'true' ? 'false' : 'true';
      button.setAttribute('aria-expanded', button.dataset.shown);
    };
    button.addEventListener('click', handler);
    return { button, handler };
  });

  // verify the baked chain on load (and surface it for tests)
  void hashChain(blocks.map((b) => b.original)).then((hashes) => {
    if (disposed) return;
    const matches = hashes.every((full, i) => full.slice(0, SHORT_LEN) === blocks[i]?.sealedShort);
    root.dataset.chainVerified = String(matches);
    hashes.forEach((full, i) => {
      const block = blocks[i];
      if (block) block.fullEl.textContent = full;
    });
  });

  return () => {
    disposed = true;
    for (const { input, handler } of inputHandlers) input.removeEventListener('input', handler);
    for (const { button, handler } of hashToggles) button.removeEventListener('click', handler);
    restore.removeEventListener('click', onRestore);
  };
}
