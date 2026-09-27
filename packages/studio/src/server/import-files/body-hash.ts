import { createHash } from "node:crypto";

/**
 * The SHA-256 of a generated file's body, as hex. Line endings count as
 * `\n` whatever they are on disk, so a checkout that converts them does
 * not make an untouched file look edited.
 *
 * @param body - The file's content without its generated header
 * @returns 64 hex characters
 * @example
 * ```ts
 * bodyHash("a\r\nb\n") === bodyHash("a\nb\n"); // true
 * ```
 */
export function bodyHash(body: string): string {
  return createHash("sha256").update(body.replaceAll("\r\n", "\n")).digest("hex");
}
