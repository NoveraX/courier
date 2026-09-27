import { existsSync, lstatSync, readdirSync, renameSync, rmdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { createLogger } from "@noverax/courier";
import { errnoCode } from "../errno-code";
import { assertRealInside } from "../project-fs/assert-real-inside";
import { discardTemp } from "../project-fs/discard-temp";
import { ensureDirectory } from "../project-fs/ensure-directory";
import type { ProjectRoot } from "../project-fs/project-root";
import { resolveProjectPath } from "../project-fs/resolve-project-path";
import { retryOnWin32 } from "../project-fs/retry-on-win32";
import type { ApplyJournal, JournalEntry } from "./apply-journal";
import { backupPath } from "./backup-path";
import { readDiskFile } from "./disk-file";
import { sweepImportTemps } from "./sweep-import-temps";

const log = createLogger("Studio");

/**
 * Undo an apply from its journal: every file it replaced comes back from the
 * backup, every file it created is removed, and every file it removed moves
 * back, each only while its path holds what the apply left there — a file
 * changed since stays, and its earlier version stays in the backup. The
 * temporary files and the directories the apply created go. A step that
 * cannot be undone is logged, naming where the backup is, and the rest are
 * still undone.
 *
 * @param root - The project
 * @param journal - The apply's journal
 * @returns The project-relative paths that could not be restored
 */
export function rollbackApply(root: ProjectRoot, journal: ApplyJournal): string[] {
  const failed: string[] = [];
  for (const entry of [...journal.entries].reverse()) {
    try {
      const outcome = undoEntry(root, journal, entry);
      if (outcome === "undone") continue;
      failed.push(entry.path);
      log.warn(
        outcome === "changed"
          ? `${entry.path} changed after the write Studio is undoing, so it is left as it is; the version before that write is in ${journal.backupDir}`
          : `Studio could not restore ${entry.path}: its copy in ${journal.backupDir} is gone`,
      );
    } catch (error) {
      failed.push(entry.path);
      log.warn(
        `Studio could not restore ${entry.path}; its copy is in ${journal.backupDir}`,
        error,
      );
    }
  }
  for (const temp of journal.temps) discardStagedTemp(root, temp);
  sweepImportTemps(resolveProjectPath(root.path, journal.dir));
  /* Copies moved back leave empty folders, which would count as a backup kept. */
  removeEmptyTree(resolveProjectPath(root.path, journal.backupDir));
  for (const dir of [...journal.createdDirs].reverse()) {
    removeIfEmpty(resolveProjectPath(root.path, dir));
  }
  return failed;
}

/* Undo one step: `changed` when its path changed after the apply and is left as it is, `lost` when its copy is gone. */
function undoEntry(
  root: ProjectRoot,
  journal: ApplyJournal,
  entry: JournalEntry,
): "undone" | "changed" | "lost" {
  const target = resolveProjectPath(root.path, entry.path);
  const copy = backupPath(root, journal.backupDir, entry.path);
  /* Nothing is undone through a link: a folder on the way that leads elsewhere refuses the step. */
  assertRealInside(root, target);
  assertRealInside(root, copy);
  const found = readDiskFile(target);
  const holdsWrite = found.kind === "file" && found.sha256 === entry.sha256;
  if (entry.step === "write" && !entry.existed) {
    if (holdsWrite) retryOnWin32(() => unlinkSync(target), `Removing ${entry.path}`);
    return holdsWrite || found.kind === "absent" ? "undone" : "changed";
  }
  const reached = entry.step === "remove" ? found.kind === "absent" : holdsWrite;
  /* Without a copy the apply either never reached the file, or the copy is lost. */
  if (!existsSync(copy)) return reached ? "lost" : "undone";
  /* Never replaced: the copy only duplicates the file, and would keep a backup of nothing. */
  if (entry.step === "write" && found.kind === "file" && holdsCopy(copy, found.sha256)) {
    retryOnWin32(() => unlinkSync(copy), `Deleting the copy of ${entry.path}`);
    return "undone";
  }
  if (!reached) return "changed";
  ensureDirectory(root, dirname(target));
  retryOnWin32(() => renameSync(copy, target), `Restoring ${entry.path}`);
  return "undone";
}

/* Whether the backup holds what the path holds: the apply never replaced it. */
function holdsCopy(copy: string, sha256: string): boolean {
  const before = readDiskFile(copy);
  return before.kind === "file" && before.sha256 === sha256;
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
