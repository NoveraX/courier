import { existsSync, renameSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { createLogger } from "@noverax/courier";
import { assertRealInside } from "../project-fs/assert-real-inside";
import { ensureDirectory } from "../project-fs/ensure-directory";
import type { ProjectRoot } from "../project-fs/project-root";
import { resolveProjectPath } from "../project-fs/resolve-project-path";
import { retryOnWin32 } from "../project-fs/retry-on-win32";
import type { ApplyJournal, JournalEntry } from "./apply-journal";
import { backupPath } from "./backup-path";
import { type DiskFile, readDiskFile } from "./disk-file";
import { clearLeftovers } from "./undo-leftovers";

const log = createLogger("Studio");

/**
 * Undo an apply from its journal: every file it replaced comes back from the
 * backup, every file it created is removed, and every file it removed moves
 * back, each only while its path holds what the apply left there — a file
 * changed since stays, and its earlier version stays in the backup. The
 * temporary files and the directories the apply created go. A path holds
 * the apply's write only when it holds the exact bytes Studio wrote, its
 * header naming the import. A step that cannot be undone is logged, naming
 * where the backup is, and the rest are still undone.
 *
 * @param root - The project
 * @param journal - The apply's journal
 * @param restore - Whether copies may be moved back into place; only for a journal tied to the import's recorded folder, or one this process wrote
 * @returns The project-relative paths that could not be restored
 */
export function rollbackApply(root: ProjectRoot, journal: ApplyJournal, restore = true): string[] {
  const failed: string[] = [];
  for (const entry of [...journal.entries].reverse()) {
    try {
      const outcome = undoEntry(root, journal, entry, restore);
      if (outcome === "undone") continue;
      failed.push(entry.path);
      log.warn(OUTCOMES[outcome](entry.path, journal));
    } catch (error) {
      failed.push(entry.path);
      log.warn(
        `Studio could not restore ${entry.path}; its copy is in ${journal.backupDir}`,
        error,
      );
    }
  }
  clearLeftovers(root, journal);
  return failed;
}

type Outcome = "undone" | "changed" | "lost" | "withheld";

const OUTCOMES: Record<
  Exclude<Outcome, "undone">,
  (path: string, journal: ApplyJournal) => string
> = {
  changed: (path, { backupDir }) =>
    `${path} changed after the write Studio is undoing, so it is left as it is; the version before that write is in ${backupDir}`,
  lost: (path, { backupDir }) =>
    `Studio could not restore ${path}: its copy in ${backupDir} is gone`,
  withheld: (path, { backupDir, importName }) =>
    `Studio did not put ${path} back: the write it is undoing is not one it can tie to the folder it records for the import ${importName}; the version before that write is in ${backupDir}`,
};

/* Undo one step: `changed` when its path changed after the apply, `lost` when its copy is gone,
   `withheld` when putting the copy back is not allowed. */
function undoEntry(
  root: ProjectRoot,
  journal: ApplyJournal,
  entry: JournalEntry,
  restore: boolean,
): Outcome {
  const target = resolveProjectPath(root.path, entry.path);
  const copy = backupPath(root, journal.backupDir, entry.path);
  /* Nothing is undone through a link: a folder on the way that leads elsewhere refuses the step. */
  assertRealInside(root, target);
  assertRealInside(root, copy);
  const found = readDiskFile(root, target);
  const holdsWrite =
    found.kind === "file" &&
    found.exact === entry.sha256 &&
    found.header?.import === journal.importName;
  if (entry.step === "write" && !entry.existed) {
    if (holdsWrite) retryOnWin32(() => unlinkSync(target), `Removing ${entry.path}`);
    return holdsWrite || found.kind === "absent" ? "undone" : "changed";
  }
  const reached = entry.step === "remove" ? found.kind === "absent" : holdsWrite;
  /* Without a copy the apply either never reached the file, or the copy is lost. */
  if (!existsSync(copy)) return reached ? "lost" : "undone";
  /* Never replaced: the copy only duplicates the file, and would keep a backup of nothing. */
  if (
    entry.step === "write" &&
    found.kind === "file" &&
    isCopyOf(readDiskFile(root, copy), found)
  ) {
    retryOnWin32(() => unlinkSync(copy), `Deleting the copy of ${entry.path}`);
    return "undone";
  }
  if (!reached) return "changed";
  if (!restore) return "withheld";
  /* Studio removes only files it signed for the import, so a copy that is not one is not its own. */
  if (entry.step === "remove" && !signedFor(readDiskFile(root, copy), journal.importName))
    return "withheld";
  ensureDirectory(root, dirname(target));
  retryOnWin32(() => renameSync(copy, target), `Restoring ${entry.path}`);
  return "undone";
}

/* Whether the path still holds the very file copied: the same file, or the same bytes. A body
   hash would not do: it ignores Studio's header and line endings, which a replace may change.
   Both are read as every file here is, from inside the project only. */
function isCopyOf(copy: DiskFile, found: Extract<DiskFile, { kind: "file" }>): boolean {
  if (copy.kind !== "file") return false;
  const { dev, ino } = copy.identity;
  return (dev === found.identity.dev && ino === found.identity.ino) || copy.exact === found.exact;
}

function signedFor(found: DiskFile, importName: string): boolean {
  return found.kind === "file" && found.header?.import === importName;
}
