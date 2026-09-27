import { lstatSync, rmdirSync } from "node:fs";
import { dirname, relative, sep } from "node:path";
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
 * directory up to, and including, the directory that bounds them — the
 * import's own — never above it. A directory that still holds anything,
 * or is a link, is left; any other failure is logged and reported.
 *
 * @param root - The project directory
 * @param bound - The absolute directory pruning goes no higher than
 * @param removed - Absolute paths of the files removed
 * @returns The directories that could not be removed for a reason other than holding files
 */
export function pruneEmptyDirs(
  root: string,
  bound: string,
  removed: readonly string[],
): PruneFailure[] {
  const candidates = new Set<string>();
  for (const file of removed) {
    /* Up to the import's own folder, which goes too once it is empty; never above it. */
    for (let dir = dirname(file); dir === bound || isWithin(bound, dir); dir = dirname(dir)) {
      candidates.add(dir);
      if (dir === bound) break;
    }
  }
  /* Deepest first, so each folder is tried once, after the folders in it. */
  const ordered = [...candidates].sort((a, b) => b.split(sep).length - a.split(sep).length);
  const failures: PruneFailure[] = [];
  for (const dir of ordered) {
    const outcome = tryRemove(dir);
    if (outcome === "removed" || outcome === "kept") continue;
    failures.push({ path: relative(root, dir), code: outcome });
    log.warn(`Studio could not remove the emptied directory ${relative(root, dir)} (${outcome})`);
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
