/* Bytes of a text as UTF-8, which every provider signs. */
const encoder = new TextEncoder();

/**
 * The HMAC-SHA-256 of a message under a key, through Web Crypto — so it runs
 * wherever the app does: Node.js, Bun, Deno, an edge runtime.
 *
 * @param key - The key's bytes, or a secret's text
 * @param message - What is signed
 * @returns The signature's bytes
 * @example
 * ```ts
 * toHex(await hmacSha256("whsec", "1700000000.{}"));
 * ```
 */
export async function hmacSha256(
  key: Uint8Array<ArrayBuffer> | string,
  message: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = typeof key === "string" ? encoder.encode(key) : key;
  const imported = await crypto.subtle.importKey(
    "raw",
    bytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", imported, encoder.encode(message)));
}

/**
 * Bytes as lowercase hex, as Stripe and GitHub write a signature.
 *
 * @param bytes - The bytes
 * @returns The hex
 * @example
 * ```ts
 * toHex(new Uint8Array([255, 1])); // "ff01"
 * ```
 */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Bytes as base64, as Standard Webhooks writes a signature.
 *
 * @param bytes - The bytes
 * @returns The base64
 * @example
 * ```ts
 * toBase64(new Uint8Array([1, 2, 3])); // "AQID"
 * ```
 */
export function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

/**
 * The bytes a base64 text holds, or none when it is not base64.
 *
 * @param text - The base64
 * @returns The bytes, or `undefined`
 * @example
 * ```ts
 * fromBase64("AQID"); // Uint8Array [1, 2, 3]
 * ```
 */
export function fromBase64(text: string): Uint8Array<ArrayBuffer> | undefined {
  try {
    return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
  } catch {
    /* Not base64: no key a signature could be checked against. */
    return undefined;
  }
}

/**
 * Whether two signatures are the same, compared in time that does not
 * depend on where they first differ — so a caller cannot learn a valid
 * signature a character at a time from how long a refusal takes.
 *
 * @param a - One signature
 * @param b - The other
 * @returns Whether they are equal
 * @example
 * ```ts
 * sameSignature("a1b2", "a1b2"); // true
 * ```
 */
export function sameSignature(a: string, b: string): boolean {
  let differs = a.length ^ b.length;
  for (let at = 0; at < Math.max(a.length, b.length); at++) {
    differs |= (a.charCodeAt(at) || 0) ^ (b.charCodeAt(at) || 0);
  }
  return differs === 0;
}
