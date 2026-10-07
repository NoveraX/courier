/**
 * The SHA-256 digest of a text, in hexadecimal: what names a set of
 * credentials where the credentials themselves must not sit — a cache's
 * keys, a pool of sockets.
 *
 * @param text - What to digest
 * @returns Its digest, 64 hexadecimal characters
 * @example
 * ```ts
 * await sha256Hex("sid=a1"); // → "6f1e…"
 * ```
 */
export async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
