import { existsSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "@noverax/courier";
import type { ImportsState } from "../../apis/imports-state";
import { ownValue } from "../../apis/own-value";
import type { ProjectRoot } from "../project-fs/project-root";
import { type ApplyJournal, dropJournal, JOURNAL_DIR, readJournals } from "./apply-journal";
import { journalProblem } from "./journal-trust";
import { rollbackApply } from "./rollback-apply";
import { runsElsewhere } from "./runs-elsewhere";
import { keepAsRecord, undoApply } from "./undo-apply";

const log = createLogger("Studio");

/* How many paths a log line names before it counts the rest. */
const LISTED = 5;

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
 * journal goes. A journal is replayed at most once, and never after an apply
 * of the same import recorded since, which may have written the same paths:
 * then, and when an undo left files it could not restore, the journal only
 * records those files, so their earlier versions stay in the backup, and
 * Studio names them at every start until that backup folder is deleted. The
 * journal of a process that still runs — another Studio on the project, in
 * the middle of its apply — is that process's to finish or undo, and is
 * left as it is. A journal that is not
 * one Studio wrote for an apply of its own — `.courier/` can arrive with a
 * project — is left as it is and logged. Run once as Studio starts, before
 * it serves anything that reads or writes an import's files.
 *
 * @param root - The project
 * @param state - The imports state: the applies it recorded, and each import's record
 * @returns What was undone
 * @example
 * ```ts
 * recoverInterruptedApplies(root, loadImportsState(root.path));
 * ```
 */
export function recoverInterruptedApplies(
  root: ProjectRoot,
  state: Pick<ImportsState, "applied" | "imports">,
): RecoveredApply[] {
  const committed = new Set(state.applied);
  const record = (name: string) => ownValue(state.imports, name);
  const recorded = (name: string): string | null => record(name)?.applyId ?? null;
  const recovered: RecoveredApply[] = [];
  for (const { fileName, journal } of readJournals(root.path)) {
    const problem = journalProblem(fileName, journal);
    if (problem !== null) {
      log.warn(
        `Studio left ${JOURNAL_DIR}/${fileName} as it is and undid nothing from it: ${problem}.`,
      );
    } else if (runsElsewhere(journal.pid)) {
      log.warn(
        `Studio left a write for the import ${journal.importName} as it is: process ${journal.pid}, which is making it, still runs.`,
      );
    } else if (committed.has(journal.id) || recorded(journal.importName) === journal.id) {
      dropJournal(root.path, journal.id);
    } else if (journal.state === "kept") {
      remind(root, journal);
    } else if (journal.entries.length > 0 && recorded(journal.importName) !== journal.after) {
      leaveUndone(root, journal);
    } else {
      /* A copy goes back only into the folder the state records for the import. */
      recovered.push(recover(root, journal, record(journal.importName)?.dir === journal.dir));
    }
  }
  return recovered;
}

function recover(root: ProjectRoot, journal: ApplyJournal, restore: boolean): RecoveredApply {
  const failed = undoApply(root, journal, restore);
  const outcome =
    failed.length === 0 ? "restored every file" : `could not restore ${listed(failed)}`;
  log.warn(
    `Studio undid a write for the import ${journal.importName} that did not finish; it ${outcome}.`,
  );
  return { importName: journal.importName, failed, backupDir: journal.backupDir };
}

/* Only the temporary files and empty folders go: the files it names may be a later apply's. */
function leaveUndone(root: ProjectRoot, journal: ApplyJournal): void {
  rollbackApply(root, { ...journal, entries: [] });
  const paths = journal.entries.map((entry) => entry.path);
  keepAsRecord(root.path, journal, paths);
  log.warn(
    `Studio did not undo a write for the import ${journal.importName} that did not finish, since a later write of the import was recorded after it: ${listed(paths)} are left as they are, and their earlier versions are in ${journal.backupDir}.`,
  );
}

/* A record whose backup folder was deleted has nothing left to keep. */
function remind(root: ProjectRoot, journal: ApplyJournal): void {
  if (!existsSync(join(root.path, journal.backupDir))) {
    dropJournal(root.path, journal.id);
    return;
  }
  const paths = journal.entries.map((entry) => entry.path);
  log.warn(
    `Studio could not restore ${listed(paths)} when it undid a write for the import ${journal.importName}; their earlier versions are in ${journal.backupDir}. Delete that folder once you no longer need them.`,
  );
}

function listed(paths: readonly string[]): string {
  if (paths.length <= LISTED) return paths.join(", ");
  return `${paths.slice(0, LISTED).join(", ")} and ${paths.length - LISTED} more`;
}
