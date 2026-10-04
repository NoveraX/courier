import { existsSync } from "node:fs";
import { IMPORTS_STATE_FILENAME, readImportsState } from "../../apis/imports-state";
import { ownValue } from "../../apis/own-value";
import { COURIER_DIR, ensureCourierSubdir } from "../courier-dir";
import type { ProjectRoot } from "../project-fs/project-root";
import { resolveProjectPath } from "../project-fs/resolve-project-path";
import { newApplyId } from "./apply-id";
import { whileApplying } from "./apply-in-flight";
import { type ApplyJournal, saveJournal } from "./apply-journal";
import { commitFiles } from "./commit-files";
import { FilePlanError } from "./file-plan-error";
import type { FilePlan } from "./file-plan-types";
import { finishApply } from "./finish-apply";
import { ImportsStateUnsafeError } from "./imports-state-unsafe-error";
import type { PruneFailure } from "./prune-empty-dirs";
import { type StagedWrite, stageWrites } from "./stage-writes";
import { undoThenThrow } from "./undo-apply";
import { verifyUnchanged } from "./verify-unchanged";

/** What an applied plan did. */
export interface ApplyReport {
  written: string[];
  removed: string[];
  kept: FilePlan["kept"];
  /** Project-relative directory holding the files replaced and removed; absent when there were none. */
  backupDir?: string | undefined;
  /** Emptied directories that could not be removed. */
  pruneFailures: PruneFailure[];
}

/**
 * Apply a plan to the project all at once, or not at all. Every file is
 * staged beside its target first; the files replaced are backed up and the
 * files removed are moved into the backup; `commit` records the outcome
 * with the apply's id — the point after which the apply stands. A failure
 * before that undoes everything; a crash is undone the next time Studio
 * starts, from the journal kept meanwhile, unless the id was recorded. The
 * files are flushed off the thread that serves requests, so Studio goes on
 * answering while a large import is written.
 *
 * @param root - The project
 * @param plan - The plan, with the user's confirmations taken in
 * @param commit - Records the applied plan and the apply's id at once, such as saving the imports state
 * @returns What was written, removed and kept, and where the backup is
 * @throws {FilePlanError} `TARGET_BLOCKED`, `NEEDS_CONFIRMATION` or `PLAN_STALE`, with nothing written
 * @throws The file system's error, after undoing what was done
 * @example
 * ```ts
 * const report = await applyFilePlan(root, withConfirmations(plan, confirmed), (applyId) => saveState(next, applyId));
 * ```
 */
export async function applyFilePlan(
  root: ProjectRoot,
  plan: FilePlan,
  commit: (applyId: string) => void,
): Promise<ApplyReport> {
  refuseUnready(plan);
  verifyUnchanged(root, plan);
  /* A .courier that is not a real folder is refused first, as it names the cause. */
  ensureCourierSubdir(root.path, "journal");
  /* The journal names the apply the import's record was saved by; an unread record names none. */
  const { state, whole } = readImportsState(root.path);
  if (!whole) throw new ImportsStateUnsafeError(IMPORTS_STATE_FILENAME, "unread");
  const id = newApplyId();
  const journal: ApplyJournal = {
    id,
    pid: process.pid,
    importName: plan.importName,
    dir: plan.dir,
    after: ownValue(state.imports, plan.importName)?.applyId ?? null,
    state: "staging",
    backupDir: `${COURIER_DIR}/backups/${id}`,
    entries: [],
    createdDirs: [],
    temps: [],
  };
  saveJournal(root.path, journal);
  return whileApplying(id, () => applyJournaled(root, plan, journal, commit));
}

/* Stage, commit and record the apply its journal describes, undoing it all on any failure before the record. */
async function applyJournaled(
  root: ProjectRoot,
  plan: FilePlan,
  journal: ApplyJournal,
  commit: (applyId: string) => void,
): Promise<ApplyReport> {
  let staged: StagedWrite[];
  try {
    staged = await stageWrites(root, plan, journal);
  } catch (error) {
    undoThenThrow(root, journal, error);
  }
  journal.state = "committing";
  journal.entries = [
    ...staged.map((s) => ({
      path: s.write.path,
      step: "write" as const,
      existed: s.existed,
      sha256: s.sha256,
    })),
    ...plan.removals.map((r) => ({ path: r.path, step: "remove" as const, existed: true })),
  ];
  let pruneFailures: PruneFailure[];
  try {
    saveJournal(root.path, journal);
    pruneFailures = await commitFiles(root, plan, staged, journal.backupDir);
    commit(journal.id);
  } catch (error) {
    undoThenThrow(root, journal, error);
  }
  finishApply(root.path, journal.id);
  /* A backup folder is made only for a file replaced or removed. */
  const backedUp = existsSync(resolveProjectPath(root.path, journal.backupDir));
  return {
    written: staged.map((s) => s.write.path),
    removed: plan.removals.map((r) => r.path),
    kept: plan.kept,
    ...(backedUp && { backupDir: journal.backupDir }),
    pruneFailures,
  };
}

function refuseUnready(plan: FilePlan): void {
  if (plan.blocked.length > 0) {
    const paths = plan.blocked.map((b) => b.path);
    throw new FilePlanError(
      "TARGET_BLOCKED",
      `Studio will not write through a link or over a non-file: ${paths.join(", ")}.`,
      { paths },
    );
  }
  if (plan.pending.length > 0) {
    const paths = plan.pending.map((p) => p.confirmation.path);
    throw new FilePlanError(
      "NEEDS_CONFIRMATION",
      `These steps wait for your consent: ${paths.join(", ")}.`,
      { paths },
    );
  }
}
