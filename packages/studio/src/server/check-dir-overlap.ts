import { createLogger } from "@noverax/courier";
import { InvalidImportError, resolveImportLayout } from "../apis/layout";
import { DirOverlapError } from "./dir-overlap-error";
import type { ImportsSnapshot } from "./imports-bridge";

const log = createLogger("Studio");

/* Letter case is ignored: on a case-insensitive disk two spellings are one directory. */
function overlaps(a: string, b: string): boolean {
  const [x, y] = [a.toLowerCase(), b.toLowerCase()];
  return x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`);
}

function declaredDirs(name: string, imports: ImportsSnapshot): Array<[string, string]> {
  const dirs: Array<[string, string]> = [];
  for (const [other, entry] of Object.entries(imports.declarations)) {
    if (other === name) continue;
    try {
      dirs.push([other, resolveImportLayout(entry, other).dir]);
    } catch (error) {
      if (!(error instanceof InvalidImportError)) throw error;
      log.debug(
        `The import "${other}" declares no directory Studio can write, so it overlaps none`,
        error,
      );
    }
  }
  return dirs;
}

/**
 * Refuse to write an import into a directory another import owns — the one
 * it is declared with, or the one Studio last wrote it to — or one nested in
 * or around it, before anything is written: each import would take the
 * other's files for its own, and removing one could remove the other's.
 *
 * @param name - The import being written
 * @param dir - Its directory, project-relative
 * @param imports - The declarations and the imports state
 * @throws {DirOverlapError} When the directories overlap
 * @example
 * ```ts
 * checkDirOverlap("petStore", layout.dir, imports);
 * ```
 */
export function checkDirOverlap(name: string, dir: string, imports: ImportsSnapshot): void {
  const recorded = Object.entries(imports.state.imports)
    .filter(([other]) => other !== name)
    .map(([other, entry]): [string, string] => [other, entry.dir]);
  for (const [other, otherDir] of [...declaredDirs(name, imports), ...recorded]) {
    if (overlaps(dir, otherDir)) throw new DirOverlapError(name, dir, other, otherDir);
  }
}
