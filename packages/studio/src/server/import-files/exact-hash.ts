import { createHash } from "node:crypto";

/**
 * The SHA-256 of a file's exact bytes: Studio's header and line endings
 * count, so only the very content Studio wrote matches.
 *
 * @param content - The text as written, UTF-8, or the bytes read
 * @returns The hex digest
 * @example
 * ```ts
 * exactHash(signGeneratedFile("pets", body)) === exactHash(readFileSync(path)); // Studio's own write
 * ```
 */
export function exactHash(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}
