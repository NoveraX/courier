import { createLogger } from "@noverax/courier";
import type { ProjectRoot } from "@noverax/courier-cli/devkit";
import { type ApplyJournal, dropJournal, JOURNAL_DIR, saveJournal } from "./apply-journal";
import { rollbackApply } from "./rollback-apply";

const log = createLogger("Studio");

/**
 * Undo an apply and settle its journal: it goes when every file came back,
 * and is otherwise kept as a record of the files that did not.
 *
 * @param root - The project
 * @param journal - The apply's journal
 * @param restore - Whether copies may be moved back into place
 * @returns The project-relative paths that could not be restored
 * @example
 * ```ts
 * const failed = undoApply(root, journal);
 * ```
 */
export function undoApply(root: ProjectRoot, journal: ApplyJournal, restore = true): string[] {
  const failed = rollbackApply(root, journal, restore);
  if (failed.length === 0) dropJournal(root.path, journal.id);
  else keepAsRecord(root.path, journal, failed);
  return failed;
}

/**
 * Keep an apply's journal only as a record of the files it names: their
 * copies are never pruned, and the journal is never replayed, since a later
 * apply may write the same paths and undoing again would undo its files.
 *
 * @param root - The project directory
 * @param journal - The apply's journal
 * @param paths - The project-relative paths the record names
 * @example
 * ```ts
 * keepAsRecord(root.path, journal, ["src/api/pets/index.ts"]);
 * ```
 */
export function keepAsRecord(root: string, journal: ApplyJournal, paths: readonly string[]): void {
  const named = new Set(paths);
  saveJournal(root, {
    ...journal,
    state: "kept",
    entries: journal.entries.filter((entry) => named.has(entry.path)),
    createdDirs: [],
    temps: [],
  });
}

/**
 * Undo an apply that failed, then throw the failure that stopped it: that is
 * what the caller hears, whatever the undo meets, which is logged.
 *
 * @param root - The project
 * @param journal - The apply's journal
 * @param error - The failure that stopped the apply
 * @throws The failure given
 * @example
 * ```ts
 * try {
 *   commit(id);
 * } catch (error) {
 *   undoThenThrow(root, journal, error);
 * }
 * ```
 */
export function undoThenThrow(root: ProjectRoot, journal: ApplyJournal, error: unknown): never {
  try {
    undoApply(root, journal);
  } catch (undoError) {
    log.warn(
      `Studio could not settle the undo of a write for the import ${journal.importName}; its journal is ${JOURNAL_DIR}/${journal.id}.json`,
      undoError,
    );
  }
  throw error;
}
