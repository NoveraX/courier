const HEX = Array.from({ length: 256 }, (_, byte) => byte.toString(16).padStart(2, "0"));

/**
 * A random UUID (version 4): `crypto.randomUUID` where the runtime has it,
 * and one made from `crypto.getRandomValues` — or `Math.random`, failing
 * that — where it has not: React Native has no `crypto` of its own. It names
 * multipart boundaries, connections and idempotency keys, which need to be
 * unique, not secret.
 *
 * @returns The id, such as `"1b4e28ba-2fa1-41d2-883f-0016d3cca427"`
 * @example
 * ```ts
 * headers.set("idempotency-key", randomId());
 * ```
 */
export function randomId(): string {
  const crypto: Partial<Crypto> | undefined = globalThis.crypto;
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof crypto?.getRandomValues === "function") crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => HEX[byte]).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
