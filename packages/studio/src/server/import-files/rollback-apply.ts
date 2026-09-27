import { existsSync, renameSync, rmdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { createLogger } from "@noverax/courier";
import { errnoCode } from "../errno-code";
import { discardTemp } from "../project-fs/discard-temp";
import { ensureDirectory } from "../project-fs/ensure-directory";
import type { ProjectRoot } from "../project-fs/project-root";
import { resolveProjectPath } from "../project-fs/resolve-project-path";
import { retryOnWin32 } from "../project-fs/retry-on-win32";
import type { ApplyJournal, JournalEntry } from "./apply-journal";
import { backupPath } from "./backup-path";
import { readDiskFile } from "./disk-file";

const log = createLogger("Studio");

/**
 * Undo an apply from its journal: every file it replaced comes back from the
 * backup, every file it created is removed if it still holds what Studio
 * wrote, every file it removed moves back, and the temporary files and the
 * directories it created go. A step that cannot be undone is logged, naming
 * where the backup is, and the rest are still undone.
 *
 * @param root - The project
 * @param journal - The apply's journal
 * @returns The project-relative paths that could not be restored
 */
export function rollbackApply(root: ProjectRoot, journal: ApplyJournal): string[] {
  const failed: string[] = [];
  for (const entry of [...journal.entries].reverse()) {
    try {
      undoEntry(root, journal, entry);
    } catch (error) {
      failed.push(entry.path);
      log.warn(
        `Studio could not restore ${entry.path}; its copy is in ${journal.backupDir}`,
        error,
      );
    }
  }
  for (const temp of journal.temps) {
    const absolute = join(root.path, temp);
    if (existsSync(absolute)) discardTemp(absolute);
  }
  for (const dir of [...journal.createdDirs].reverse()) removeIfEmpty(join(root.path, dir));
  return failed;
}

function undoEntry(root: ProjectRoot, journal: ApplyJournal, entry: JournalEntry): void {
  const target = resolveProjectPath(root.path, entry.path);
  const copy = backupPath(root, journal.backupDir, entry.path);
  if (entry.step === "remove" || entry.existed) {
    if (!existsSync(copy)) return;
    ensureDirectory(root, dirname(target));
    retryOnWin32(() => renameSync(copy, target), `Restoring ${entry.path}`);
    return;
  }
  const found = readDiskFile(target);
  if (found.kind === "file" && found.sha256 === entry.sha256) {
    retryOnWin32(() => unlinkSync(target), `Removing ${entry.path}`);
  }
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
