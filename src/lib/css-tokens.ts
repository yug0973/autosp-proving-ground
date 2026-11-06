/**
 * Reads motion tokens from tokens.css, so JavaScript-driven motion uses the same durations as CSS
 * (DESIGN.md §7: durations from tokens only).
 */

/** A duration token such as `--dur-slow`, in milliseconds. Returns `fallback` if it can't be read. */
export function durationMs(name: `--${string}`, fallback = 0): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const match = /^(-?\d*\.?\d+)(ms|s)$/.exec(raw);
  if (!match) return fallback;
  const value = Number(match[1]);
  return match[2] === 's' ? value * 1000 : value;
}

/** A plain number token such as `--cursor-grow`. Returns `fallback` if it can't be read. */
export function numberToken(name: `--${string}`, fallback = 0): number {
  const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(value) ? value : fallback;
}
