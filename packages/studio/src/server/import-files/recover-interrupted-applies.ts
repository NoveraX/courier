import { createLogger } from "@noverax/courier";
import type { ProjectRoot } from "../project-fs/project-root";
import { dropJournal, JOURNAL_DIR, readJournals } from "./apply-journal";
import { journalProblem } from "./journal-trust";
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
 * journal goes. A journal that is not one Studio wrote for an apply of its
 * own — `.courier/` can arrive with a project — is left as it is and
 * logged. Run once as Studio starts, before it serves anything that reads
 * or writes an import's files.
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
  for (const { fileName, journal } of readJournals(root.path)) {
    const problem = journalProblem(fileName, journal);
    if (problem !== null) {
      log.warn(
        `Studio left ${JOURNAL_DIR}/${fileName} as it is and undid nothing from it: ${problem}.`,
      );
      continue;
    }
    if (committed.has(journal.id)) {
      dropJournal(root.path, journal.id);
      continue;
    }
    const failed = rollbackApply(root, journal);
    /* A journal with files not restored stays, and so do its copies: the next start tries again. */
    if (failed.length === 0) dropJournal(root.path, journal.id);
    recovered.push({ importName: journal.importName, failed, backupDir: journal.backupDir });
    const outcome =
      failed.length === 0 ? "restored every file" : `could not restore ${failed.join(", ")}`;
    log.warn(
      `Studio undid a write for the import ${journal.importName} that did not finish; it ${outcome}.`,
    );
  }
  return recovered;
}
