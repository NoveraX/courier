import { createLogger } from "@noverax/courier";
import { sha256Hex } from "./file-hash";
import { readWatchedBytes } from "./read-watched-bytes";

const log = createLogger("Studio");

/**
 * What a hash of a file that is there but cannot be read reads as. It is no
 * sha256 digest, so it never equals the hash of any bytes.
 */
export const UNREADABLE = "unreadable";

/**
 * The sha256 of the raw bytes at a path Studio watches, read as the loader
 * reads them (see `readWatchedBytes`), so a FIFO never blocks it.
 *
 * Raw bytes, never decoded text: a file that is not valid UTF-8 hashes the
 * same every time it is read, whoever reads it, so comparing two hashes of it
 * never reports a change that did not happen.
 *
 * @param path - The file
 * @returns Its digest as hex, `null` when there is nothing at the path, or
 *   {@link UNREADABLE} when it cannot be read
 * @example
 * ```ts
 * if (contentHashOf(file) !== hashTheLoadRead) reload();
 * ```
 */
export function contentHashOf(path: string): string | null {
  try {
    const bytes = readWatchedBytes(path);
    return bytes === null ? null : sha256Hex(bytes);
  } catch (error) {
    log.debug(`Could not read ${path} to hash it`, error);
    return UNREADABLE;
  }
}
