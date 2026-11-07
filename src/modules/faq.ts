/**
 * The questions: one answer open at a time. Browsers that know `<details name>` do this themselves;
 * for the rest, opening one closes the others. Without script every answer can still be opened.
 */
export function initFaq(root: ParentNode = document): () => void {
  const groups = new Map<string, HTMLDetailsElement[]>();
  for (const item of root.querySelectorAll<HTMLDetailsElement>('details[data-faq]')) {
    const name = item.dataset.faq ?? 'faq';
    groups.set(name, [...(groups.get(name) ?? []), item]);
  }
  const onToggle = (event: Event): void => {
    const opened = event.target;
    if (!(opened instanceof HTMLDetailsElement) || !opened.open) return;
    for (const other of groups.get(opened.dataset.faq ?? 'faq') ?? []) {
      if (other !== opened && other.open) other.open = false;
    }
  };
  const all = [...groups.values()].flat();
  for (const item of all) item.addEventListener('toggle', onToggle);
  return () => {
    for (const item of all) item.removeEventListener('toggle', onToggle);
  };
}
