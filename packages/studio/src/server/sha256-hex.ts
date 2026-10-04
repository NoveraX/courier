import { createHash } from "node:crypto";

/**
 * The sha256 digest of some bytes, as hex; a string is hashed as UTF-8.
 *
 * Every hash Studio compares — the one a load records, the one a preview
 * returns, the one a write checks — comes from here, so they stay comparable.
 *
 * @param bytes - What to hash
 * @returns 64 lowercase hex digits
 * @example
 * ```ts
 * sha256Hex("abc"); // "ba7816bf…15ad"
 * ```
 */
export function sha256Hex(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
