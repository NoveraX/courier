import { lstatSync, rmdirSync } from "node:fs";
import { dirname, relative } from "node:path";
import { createLogger } from "@noverax/courier";
import { errnoCode } from "../errno-code";
import { isWithin } from "../project-fs/is-within";

const log = createLogger("Studio");

/** A directory Studio meant to remove and could not, and why. */
export interface PruneFailure {
  path: string;
  code: string;
}

/**
 * Remove the directories that removing files left empty, from each file's
 * directory up to, never including, the directory that bounds them. A
 * directory that still holds anything, or is a link, is left; any other
 * failure is logged and reported.
 *
 * @param root - The project directory
 * @param bound - The absolute directory pruning stops below
 * @param removed - Absolute paths of the files removed
 * @returns The directories that could not be removed for a reason other than holding files
 */
export function pruneEmptyDirs(
  root: string,
  bound: string,
  removed: readonly string[],
): PruneFailure[] {
  const failures: PruneFailure[] = [];
  const tried = new Set<string>();
  for (const file of removed) {
    let dir = dirname(file);
    while (dir !== bound && isWithin(bound, dir) && !tried.has(dir)) {
      tried.add(dir);
      const outcome = tryRemove(dir);
      if (outcome === "kept") break;
      if (outcome !== "removed") {
        failures.push({ path: relative(root, dir), code: outcome });
        log.warn(
          `Studio could not remove the emptied directory ${relative(root, dir)} (${outcome})`,
        );
        break;
      }
      dir = dirname(dir);
    }
  }
  return failures;
}

function tryRemove(dir: string): "removed" | "kept" | string {
  try {
    if (lstatSync(dir).isSymbolicLink()) return "kept";
    rmdirSync(dir);
    return "removed";
  } catch (error) {
    const code = errnoCode(error) ?? "UNKNOWN";
    if (code === "ENOENT") return "removed";
    if (code === "ENOTEMPTY" || code === "EEXIST") return "kept";
    return code;
  }
}
