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
      if (undoEntry(root, journal, entry)) continue;
      failed.push(entry.path);
      log.warn(
        `${entry.path} changed after the write Studio is undoing, so it is left as it is; the version before that write is in ${journal.backupDir}`,
      );
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

/* Undo one step; `false` when its path changed after the apply, and is left as it is. */
function undoEntry(root: ProjectRoot, journal: ApplyJournal, entry: JournalEntry): boolean {
  const target = resolveProjectPath(root.path, entry.path);
  const copy = backupPath(root, journal.backupDir, entry.path);
  const found = readDiskFile(target);
  const holdsWrite = found.kind === "file" && found.sha256 === entry.sha256;
  if (entry.step === "write" && !entry.existed) {
    if (holdsWrite) retryOnWin32(() => unlinkSync(target), `Removing ${entry.path}`);
    return holdsWrite || found.kind === "absent";
  }
  /* No copy: the apply never reached this file, which still holds what it held. */
  if (!existsSync(copy)) return true;
  if (entry.step === "write" && found.kind === "file" && holdsCopy(copy, found.sha256)) return true;
  const untouchedSince = entry.step === "remove" ? found.kind === "absent" : holdsWrite;
  if (!untouchedSince) return false;
  ensureDirectory(root, dirname(target));
  retryOnWin32(() => renameSync(copy, target), `Restoring ${entry.path}`);
  return true;
}

/* Whether the backup holds what the path holds: the apply never replaced it. */
function holdsCopy(copy: string, sha256: string): boolean {
  const before = readDiskFile(copy);
  return before.kind === "file" && before.sha256 === sha256;
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
