import { sha256 } from "./sha256";

/**
 * The SHA-256 digest of a text, in hexadecimal: what names a set of
 * credentials where the credentials themselves must not sit — a cache's
 * keys, a pool of sockets. `crypto.subtle` digests it where the runtime has
 * one; React Native and a page served over plain HTTP have none, and get
 * the same digest from JavaScript.
 *
 * @param text - What to digest
 * @returns Its digest, 64 hexadecimal characters
 * @example
 * ```ts
 * await sha256Hex("sid=a1"); // → "6f1e…"
 * ```
 */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const crypto: Partial<Crypto> | undefined = globalThis.crypto;
  const digest =
    crypto?.subtle === undefined
      ? sha256(bytes)
      : new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
