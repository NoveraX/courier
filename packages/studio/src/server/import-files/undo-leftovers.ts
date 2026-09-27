import { existsSync, lstatSync, readdirSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "@noverax/courier";
import { errnoCode } from "../errno-code";
import { assertRealInside } from "../project-fs/assert-real-inside";
import { discardTemp } from "../project-fs/discard-temp";
import type { ProjectRoot } from "../project-fs/project-root";
import { resolveProjectPath } from "../project-fs/resolve-project-path";
import type { ApplyJournal } from "./apply-journal";
import { sweepImportTemps } from "./sweep-import-temps";

const log = createLogger("Studio");

/**
 * Clear what an undone apply leaves besides its files: its temporary files,
 * those its journal names and any other of Studio's in the import's folder;
 * the empty folders copies moved back leave in its backup, which would
 * count as a backup kept; and the folders it created, once empty.
 *
 * @param root - The project
 * @param journal - The apply's journal
 * @example
 * ```ts
 * clearLeftovers(root, journal);
 * ```
 */
export function clearLeftovers(root: ProjectRoot, journal: ApplyJournal): void {
  for (const temp of journal.temps) discardStagedTemp(root, temp);
  sweepImportTemps(resolveProjectPath(root.path, journal.dir));
  removeEmptyTree(resolveProjectPath(root.path, journal.backupDir));
  for (const dir of [...journal.createdDirs].reverse()) {
    removeIfEmpty(resolveProjectPath(root.path, dir));
  }
}

/* Only a regular file, reached through no link, is a temporary file of Studio's to delete. */
function discardStagedTemp(root: ProjectRoot, temp: string): void {
  const absolute = resolveProjectPath(root.path, temp);
  if (!existsSync(absolute)) return;
  try {
    assertRealInside(root, absolute);
  } catch (error) {
    log.warn(`Studio left ${temp} as it is: it is reached through a link`, error);
    return;
  }
  if (lstatSync(absolute).isFile()) discardTemp(absolute);
}

function removeEmptyTree(dir: string): void {
  let names: string[];
  try {
    if (!lstatSync(dir).isDirectory()) return;
    names = readdirSync(dir);
  } catch (error) {
    if (errnoCode(error) === "ENOENT") return;
    throw error;
  }
  for (const name of names) removeEmptyTree(join(dir, name));
  removeIfEmpty(dir);
}

function removeIfEmpty(dir: string): void {
  try {
    rmdirSync(dir);
  } catch (error) {
    const code = errnoCode(error);
    if (code !== "ENOENT" && code !== "ENOTEMPTY" && code !== "EEXIST") {
      log.warn(`Studio could not remove ${dir}, which it created for an apply it undid`, error);
    }
  }
}
