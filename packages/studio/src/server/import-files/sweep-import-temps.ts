import { lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { errnoCode } from "../errno-code";
import { discardTemp } from "../project-fs/discard-temp";
import { isImportTempName } from "./stage-writes";

/**
 * Delete the temporary files Studio staged an import's files in and that a
 * crash left behind, wherever they are in the import's folder — the one a
 * crash kept its journal from naming too. Nothing else is touched, and no
 * link is followed.
 *
 * @param dir - The import's folder, absolute
 * @example
 * ```ts
 * sweepImportTemps(resolveProjectPath(root.path, journal.dir));
 * ```
 */
export function sweepImportTemps(dir: string): void {
  let names: string[];
  try {
    if (!lstatSync(dir).isDirectory()) return;
    names = readdirSync(dir);
  } catch (error) {
    if (errnoCode(error) === "ENOENT") return;
    throw error;
  }
  for (const name of names) {
    const path = join(dir, name);
    const stats = lstatSync(path);
    if (stats.isDirectory()) sweepImportTemps(path);
    else if (stats.isFile() && isImportTempName(name)) discardTemp(path);
  }
}
