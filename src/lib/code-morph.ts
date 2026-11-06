/**
 * A character-grid morph between two versions of the same monospace code block (DESIGN.md §6.2,
 * stage 3). Both versions are laid out on one fixed grid of rows and columns. Because the font is
 * monospace, a cell's position is exact, so a character that is the same in both versions keeps its
 * place; a cell whose character changes gets both glyphs stacked, the old one to fade out and the
 * new one to fade in. The sequence module tweens those glyph opacities from the scroll timeline, so
 * the morph is driven by scroll position alone and reverses exactly (§6.2).
 *
 * The grid is aria-hidden: it is the animated, decorative view of the code. The accessible text of
 * each stage is carried by the stage headings and the panel content.
 */

export interface CodeMorph {
  /** The grid element to place in the DOM. */
  readonly element: HTMLElement;
  /** Old glyphs of cells that change, in reading order (fade these out). */
  readonly removed: readonly HTMLElement[];
  /** New glyphs of cells that change, in reading order (fade these in). */
  readonly added: readonly HTMLElement[];
  /** Jumps straight to the before state (added hidden, removed shown). */
  showBefore(): void;
  /** Jumps straight to the after state (added shown, removed hidden). */
  showAfter(): void;
}

function glyph(char: string, row: number, col: number, role: 'static' | 'before' | 'after'): HTMLElement {
  const span = document.createElement('span');
  span.className = `morph__cell morph__cell--${role}`;
  span.textContent = char;
  span.style.setProperty('--row', String(row));
  span.style.setProperty('--col', String(col));
  return span;
}

/**
 * Builds a morph from `before` to `after`, each an array of code lines. The two arrays should have
 * the same number of lines (pad with empty strings if needed); lines may differ in length.
 */
export function createCodeMorph(before: readonly string[], after: readonly string[]): CodeMorph {
  const element = document.createElement('div');
  element.className = 'morph';
  element.setAttribute('aria-hidden', 'true');

  const rows = Math.max(before.length, after.length);
  const columns = Math.max(...before.map((l) => l.length), ...after.map((l) => l.length), 1);
  element.style.setProperty('--rows', String(rows));
  element.style.setProperty('--cols', String(columns));

  const removed: HTMLElement[] = [];
  const added: HTMLElement[] = [];

  for (let row = 0; row < rows; row += 1) {
    const beforeLine = before[row] ?? '';
    const afterLine = after[row] ?? '';
    const width = Math.max(beforeLine.length, afterLine.length);
    for (let col = 0; col < width; col += 1) {
      const b = beforeLine[col] ?? '';
      const a = afterLine[col] ?? '';
      if (b === a) {
        if (a !== '' && a !== ' ') element.append(glyph(a, row, col, 'static'));
        continue;
      }
      if (b !== '') {
        const span = glyph(b, row, col, 'before');
        removed.push(span);
        element.append(span);
      }
      if (a !== '') {
        const span = glyph(a, row, col, 'after');
        added.push(span);
        element.append(span);
      }
    }
  }

  const setState = (addedOpacity: string, removedOpacity: string): void => {
    for (const span of added) span.style.opacity = addedOpacity;
    for (const span of removed) span.style.opacity = removedOpacity;
  };

  return {
    element,
    removed,
    added,
    showBefore: () => {
      setState('0', '1');
    },
    showAfter: () => {
      setState('1', '0');
    },
  };
}
