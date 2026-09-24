import { realpathSync } from "node:fs";
import { createLogger } from "@noverax/courier";

const log = createLogger("Studio");

/**
 * The project root with its links resolved, as the loader names files: a
 * path shown relative to it then reads the same whichever way the project
 * was reached. A root that cannot be resolved — gone, or not there yet — is
 * kept as given.
 *
 * @param projectRoot - The project root as given
 * @returns The root, symlinks resolved when it can be
 *
 * @example
 * ```ts
 * resolvedRoot("/tmp/app"); // → "/private/tmp/app" on macOS
 * ```
 */
export function resolvedRoot(projectRoot: string): string {
  try {
    return realpathSync(projectRoot);
  } catch (err) {
    log.debug(`${projectRoot} could not be resolved`, err);
    return projectRoot;
  }
}
