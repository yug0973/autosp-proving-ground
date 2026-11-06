/**
 * The visitor's place in the story: which finding they chose to follow. The picker writes it;
 * the world, the diff panel and every later step read it. One finding is always chosen (SQL
 * injection until the visitor picks another), so scrolling alone still tells the whole story.
 */

/** The findings the visitor can follow: the categories the published results cover. */
export const PICKABLE = ['CWE-89', 'CWE-79', 'CWE-639'] as const;
export type FindingId = (typeof PICKABLE)[number];

let current: FindingId = 'CWE-89';
const listeners = new Set<(id: FindingId) => void>();

export function isFindingId(value: string): value is FindingId {
  return (PICKABLE as readonly string[]).includes(value);
}

export function getFinding(): FindingId {
  return current;
}

export function setFinding(id: FindingId): void {
  if (id === current) return;
  current = id;
  for (const listener of listeners) listener(id);
}

/** Which fix the visitor sends through the gates: the one from the sandbox, or a careless one. */
export type FixChoice = 'sandbox' | 'careless';
let choice: FixChoice = 'sandbox';
const choiceListeners = new Set<(choice: FixChoice) => void>();

export function getChoice(): FixChoice {
  return choice;
}

export function setChoice(next: FixChoice): void {
  if (next === choice) return;
  choice = next;
  for (const listener of choiceListeners) listener(next);
}

/** Calls `listener` whenever the fix choice changes. Returns a function that stops it. */
export function onChoice(listener: (choice: FixChoice) => void): () => void {
  choiceListeners.add(listener);
  return () => {
    choiceListeners.delete(listener);
  };
}

/** Whether the visitor has merged the fix (by holding the merge button). */
let merged = false;
const mergeListeners = new Set<(merged: boolean) => void>();

export function isMerged(): boolean {
  return merged;
}

export function setMerged(next: boolean): void {
  if (next === merged) return;
  merged = next;
  for (const listener of mergeListeners) listener(next);
}

/** Calls `listener` whenever the merge state changes. Returns a function that stops it. */
export function onMerge(listener: (merged: boolean) => void): () => void {
  mergeListeners.add(listener);
  return () => {
    mergeListeners.delete(listener);
  };
}

/** How far the merge button is held, 0 to 1: it fills while held and drains when let go early. */
let hold = 0;
const holdListeners = new Set<(hold: number) => void>();

export function setHold(next: number): void {
  if (next === hold) return;
  hold = next;
  for (const listener of holdListeners) listener(next);
}

/** Calls `listener` whenever the hold changes. Returns a function that stops it. */
export function onHold(listener: (hold: number) => void): () => void {
  holdListeners.add(listener);
  return () => {
    holdListeners.delete(listener);
  };
}

const failures = new Set<() => void>();

/** The reproduction test has just failed on the code as it is: the finding is real. */
export function announceFailure(): void {
  for (const listener of failures) listener();
}

/** Calls `listener` each time a reproduction test fails. Returns a function that stops it. */
export function onFailure(listener: () => void): () => void {
  failures.add(listener);
  return () => {
    failures.delete(listener);
  };
}

/** Calls `listener` whenever the chosen finding changes. Returns a function that stops it. */
export function onFinding(listener: (id: FindingId) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
