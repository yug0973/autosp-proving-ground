/**
 * A small Python highlighter for the diffs on the page: strings, comments, keywords, numbers and
 * calls. It only colours what is there (never a signal colour: those carry state), and leaves
 * anything it does not know as plain text.
 */
const TOKEN =
  /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(#.*)|\b(def|return|if|elif|else|for|while|in|import|from|as|with|not|and|or|is|None|True|False|assert|raise|try|except|class|lambda|yield|pass)\b|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_]\w*)(?=\()/g;
const KINDS = ['str', 'com', 'kw', 'num', 'fn'] as const;

export function highlightPython(text: string): DocumentFragment {
  const out = document.createDocumentFragment();
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const at = match.index;
    if (at > last) out.append(text.slice(last, at));
    const group = match.slice(1).findIndex((part: string | undefined) => part !== undefined);
    const span = document.createElement('span');
    span.className = `tok tok--${KINDS[group] ?? 'fn'}`;
    span.textContent = match[0];
    out.append(span);
    last = at + match[0].length;
  }
  if (last < text.length) out.append(text.slice(last));
  return out;
}

/** The diff in unified form, for the Copy patch button (the code is the demo's, not a real repository's). */
export function unifiedDiff(file: string, lines: ReadonlyArray<{ kind: string; text: string }>): string {
  const removed = lines.filter((line) => line.kind !== '+').length;
  const added = lines.filter((line) => line.kind !== '-').length;
  const body = lines.map((line) => `${line.kind}${line.text}`).join('\n');
  return `--- a/${file}\n+++ b/${file}\n@@ -1,${String(removed)} +1,${String(added)} @@\n${body}\n`;
}
