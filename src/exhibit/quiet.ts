/**
 * Quiet mode: the exhibition with nothing moving that doesn't have to. It turns on by itself for a visitor
 * who asks for reduced motion or to save data, and for a machine with little memory or few cores. In it
 * the walls keep their own colours room by room, the route line is drawn whole, and every room shows its
 * final state; the demos a visitor works themselves (run it again, tamper, toggle, hold to sign) still work.
 *
 * `?quiet` forces it, and `?quiet=0` turns it off, for testing and for a visitor who prefers it.
 */
interface NetworkInformation {
  readonly saveData?: boolean;
}

export function isQuiet(): boolean {
  const asked = new URLSearchParams(location.search).get('quiet');
  if (asked !== null) return asked !== '0';
  const nav = navigator as Navigator & { connection?: NetworkInformation; deviceMemory?: number };
  return (
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    nav.connection?.saveData === true ||
    (nav.deviceMemory !== undefined && nav.deviceMemory <= 4) ||
    navigator.hardwareConcurrency <= 4
  );
}
