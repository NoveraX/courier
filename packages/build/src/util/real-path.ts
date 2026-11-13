import { realpathSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { localPath } from "./local-path";

/**
 * A folder by the name the file system gives it, whatever path leads
 * there: its links resolved, and on Windows a short name such as
 * `RUNNER~1` written out. A watcher names what it follows by the path it
 * was handed, a link's among them, and the code a reading runs names a
 * path its own way: both are compared by this name. A folder that is not
 * there is named from the nearest one above it that is, as one gone since
 * was named while it was there.
 *
 * @param path - The folder, absolute
 * @returns Its real path, or the path as {@link localPath} writes it where nothing above it can be read
 * @example
 * ```ts
 * realFolder("/app-link/switches"); // where /app-link leads to /app → "/app/switches"
 * ```
 */
export function realFolder(path: string): string {
  const local = localPath(path);
  try {
    return realpathSync.native(local);
  } catch {
    const parent = dirname(local);
    return parent === local ? local : join(realFolder(parent), basename(local));
  }
}

/**
 * A file by the name the file system gives it: its folder's real name,
 * and its own, so that a link at its name stays the link, as a watcher
 * reports it. See {@link realFolder}.
 *
 * @param path - The file, absolute, there or not
 * @returns Its real path
 * @example
 * ```ts
 * realFile("/app-link/flags.json"); // where /app-link leads to /app → "/app/flags.json"
 * ```
 */
export function realFile(path: string): string {
  const local = localPath(path);
  return join(realFolder(dirname(local)), basename(local));
}
