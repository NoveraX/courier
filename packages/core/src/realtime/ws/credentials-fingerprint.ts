import { stableStringify } from "./topic-key";
import type { WSCredentials } from "./ws-credentials";

/**
 * A short stand-in for credentials, kept to tell whether those asked for
 * next differ from those the server refused — not the credentials
 * themselves, which are let go of once their frame is sent.
 *
 * Equal credentials always give the same fingerprint; different ones give
 * different ones but for a chance of one in 2^53. It is no secret's hash in
 * the cryptographic sense, and need not be: it never leaves the client, and
 * a collision costs one attempt not made.
 *
 * @param credentials - What a socket opens with
 * @returns The fingerprint
 * @example
 * ```ts
 * fingerprintOf({ frame: { auth: { token: "t1" } } }) === fingerprintOf({ frame: { auth: { token: "t1" } } }); // → true
 * ```
 */
export function fingerprintOf(credentials: WSCredentials | undefined): string {
  return hash53(stableStringify(JSON.parse(JSON.stringify(credentials ?? {}))));
}

/* cyrb53: two 32-bit lanes mixed into 53 bits, written as base 36. */
function hash53(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
