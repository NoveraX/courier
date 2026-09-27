import { realpathSync } from "node:fs";
import { resolve } from "node:path";

/** The project's directory, by the name Studio was given and as it is on disk. */
export interface ProjectRoot {
  /** The absolute path paths are resolved against and reported relative to. */
  path: string;
  /**
   * The same directory through `realpathSync.native`: every link resolved and,
   * on a case-insensitive file system, the letter case the disk stores. The
   * checks that follow links compare against this.
   */
  real: string;
}

/**
 * Describe a project directory for the containment checks.
 *
 * @param path - The project directory, absolute or relative to the working directory
 * @returns Its resolved and real paths
 * @throws The file system's error when the directory does not exist
 * @example
 * ```ts
 * const root = projectRootAt(process.cwd());
 * ```
 */
export function projectRootAt(path: string): ProjectRoot {
  const resolved = resolve(path);
  return { path: resolved, real: realpathSync.native(resolved) };
}
