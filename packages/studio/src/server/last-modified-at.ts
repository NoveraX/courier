import { statSync } from "node:fs";
import { dirname } from "node:path";
import { createLogger } from "@noverax/courier";

const log = createLogger("Studio");

/**
 * When the file system last changed what is at a path: the modification
 * time of the file there, or, when nothing is, of the nearest directory
 * above it that exists — deleting a file or renaming it away changes the
 * directory that held it, and removing a whole directory changes its parent.
 *
 * A link at the name is followed, as the loader follows it. A path that
 * cannot be looked up — a link that loops, a directory above it Studio may
 * not search — counts as nothing there: creating the link, or changing the
 * directory's permissions, changed a directory above it.
 *
 * @param path - An absolute path
 * @returns The time in epoch milliseconds
 * @example
 * ```ts
 * const justSaved = Date.now() - lastModifiedAt("/app/courier.config.ts") < 100;
 * ```
 */
export function lastModifiedAt(path: string): number {
  let at = path;
  for (;;) {
    const modifiedAt = modifiedAtOf(at);
    if (modifiedAt !== null) return modifiedAt;
    const parent = dirname(at);
    if (parent === at) return Number.NEGATIVE_INFINITY;
    at = parent;
  }
}

function modifiedAtOf(path: string): number | null {
  try {
    return statSync(path, { throwIfNoEntry: false })?.mtimeMs ?? null;
  } catch (error) {
    log.debug(`Could not look up ${path} to tell when it changed`, error);
    return null;
  }
}
