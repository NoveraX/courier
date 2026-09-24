import { createHash } from "node:crypto";
import { readRegularFile } from "./read-regular-file";

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

/**
 * The sha256 digest of a regular file's bytes, as hex, read without following
 * a link at its name and without blocking on a FIFO.
 *
 * @param path - The file
 * @returns The digest, or `null` when there is nothing at the path
 * @throws {NotRegularFileError} When the path is a symbolic link or not a regular file
 * @throws The file system's error for anything else, such as `EACCES`
 * @example
 * ```ts
 * const before = hashFile(configFile);
 * ```
 */
export function hashFile(path: string): string | null {
  const file = readRegularFile(path);
  return file === null ? null : sha256Hex(file.bytes);
}
