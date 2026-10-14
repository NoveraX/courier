import { readRegularFile } from "@noverax/courier-cli/devkit";
import { sha256Hex } from "./sha256-hex";

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
