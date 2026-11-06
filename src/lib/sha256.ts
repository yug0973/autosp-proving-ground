/**
 * SHA-256 over UTF-8 text, via the Web Crypto API (DESIGN.md §6.5, §11). Returns lowercase hex.
 *
 * Verified against the published vector SHA-256("abc") = ba7816bf… in tests/module4.py.
 */

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

/** The SHA-256 of `text` as 64 lowercase hex characters. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return toHex(digest);
}

/**
 * Computes the hash chain over `payloads`: `hash_i = SHA-256(hash_{i-1} + payload_i)`, starting from
 * the empty-string genesis. Returns one full hex hash per payload, in order.
 */
export async function hashChain(payloads: readonly string[]): Promise<string[]> {
  const hashes: string[] = [];
  let previous = '';
  for (const payload of payloads) {
    previous = await sha256Hex(previous + payload);
    hashes.push(previous);
  }
  return hashes;
}
