import { realpathSync } from "node:fs";
import { errnoCode } from "./errno-code";
import { readRegularFile } from "./read-regular-file";

/**
 * The bytes of a module Studio watches, read the way the loader reads it:
 * through a link at its name, as Node's resolution follows one, but never
 * blocking on a FIFO, a device or anything else that is not a regular file.
 *
 * The link is resolved first and the file it names is then read without
 * following another, so a name swapped for a link or a FIFO meanwhile fails
 * the read instead of hanging the event loop.
 *
 * @param path - The module's path, as the dependency walk found it
 * @returns Its bytes, or `null` when there is nothing at the path or behind it
 * @throws {NotRegularFileError} When the file behind the name is not a regular file
 * @throws The file system's error for anything else, such as `EACCES`
 * @example
 * ```ts
 * const bytes = readWatchedBytes("/app/src/api.ts");
 * if (bytes !== null) console.log(bytes.length);
 * ```
 */
export function readWatchedBytes(path: string): Buffer | null {
  const file = resolveLink(path);
  return file === null ? null : (readRegularFile(file)?.bytes ?? null);
}

function resolveLink(path: string): string | null {
  try {
    return realpathSync(path);
  } catch (error) {
    if (errnoCode(error) === "ENOENT") return null;
    throw error;
  }
}
