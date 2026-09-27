import { createLogger } from "@noverax/courier";
import type { ProjectRoot } from "../project-fs/project-root";
import { dropJournal, readJournals } from "./apply-journal";
import { rollbackApply } from "./rollback-apply";

const log = createLogger("Studio");

/** An apply Studio found unfinished and undid. */
export interface RecoveredApply {
  importName: string;
  /** Project-relative files that could not be restored; their copies are in `backupDir`. */
  failed: string[];
  backupDir: string;
}

/**
 * Undo every apply a crash or a kill left unfinished, from the journals it
 * kept: staged files and created directories go, files replaced or removed
 * come back. An apply whose outcome was recorded stands, and only its
 * journal goes. Run once as Studio starts, before it serves anything that
 * reads or writes an import's files.
 *
 * @param root - The project
 * @param committed - The ids of the applies whose outcome was recorded
 * @returns What was undone
 * @example
 * ```ts
 * recoverInterruptedApplies(root, new Set(loadImportsState(root.path).applied));
 * ```
 */
export function recoverInterruptedApplies(
  root: ProjectRoot,
  committed: ReadonlySet<string>,
): RecoveredApply[] {
  const recovered: RecoveredApply[] = [];
  for (const journal of readJournals(root.path)) {
    if (committed.has(journal.id)) {
      dropJournal(root.path, journal.id);
      continue;
    }
    const failed = rollbackApply(root, journal);
    dropJournal(root.path, journal.id);
    recovered.push({ importName: journal.importName, failed, backupDir: journal.backupDir });
    const outcome =
      failed.length === 0 ? "restored every file" : `could not restore ${failed.join(", ")}`;
    log.warn(
      `Studio undid a write for the import ${journal.importName} that did not finish; it ${outcome}.`,
    );
  }
  return recovered;
}
