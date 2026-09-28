import { renameSync } from "node:fs";
import { dirname } from "node:path";
import { IMPORTS_STATE_FILENAME, readImportsState } from "../../apis/imports-state";
import { ownValue } from "../../apis/own-value";
import { COURIER_DIR, ensureCourierSubdir } from "../courier-dir";
import { ensureDirectory } from "../project-fs/ensure-directory";
import type { ProjectRoot } from "../project-fs/project-root";
import { resolveProjectPath } from "../project-fs/resolve-project-path";
import { retryOnWin32 } from "../project-fs/retry-on-win32";
import { syncDirectory } from "../project-fs/sync-directory";
import { newApplyId } from "./apply-id";
import { type ApplyJournal, saveJournal } from "./apply-journal";
import { backUp } from "./back-up";
import { backupPath } from "./backup-path";
import { FilePlanError } from "./file-plan-error";
import type { FilePlan } from "./file-plan-types";
import { finishApply } from "./finish-apply";
import { ImportsStateUnsafeError } from "./imports-state-unsafe-error";
import { type PruneFailure, pruneEmptyDirs } from "./prune-empty-dirs";
import { refuseObstacle, type StagedWrite, stageWrites } from "./stage-writes";
import { undoThenThrow } from "./undo-apply";
import { verifyUnchanged } from "./verify-unchanged";

/** What an applied plan did. */
export interface ApplyReport {
  written: string[];
  removed: string[];
  kept: FilePlan["kept"];
  /** Project-relative directory holding the files replaced and removed. */
  backupDir: string;
  /** Emptied directories that could not be removed. */
  pruneFailures: PruneFailure[];
}

/**
 * Apply a plan to the project all at once, or not at all. Every file is
 * staged beside its target first; the files replaced are backed up and the
 * files removed are moved into the backup; `commit` records the outcome
 * with the apply's id — the point after which the apply stands. A failure
 * before that undoes everything; a crash is undone the next time Studio
 * starts, from the journal kept meanwhile, unless the id was recorded.
 *
 * @param root - The project
 * @param plan - The plan, with the user's confirmations taken in
 * @param commit - Records the applied plan and the apply's id at once, such as saving the imports state
 * @returns What was written, removed and kept, and where the backup is
 * @throws {FilePlanError} `TARGET_BLOCKED`, `NEEDS_CONFIRMATION` or `PLAN_STALE`, with nothing written
 * @throws The file system's error, after undoing what was done
 * @example
 * ```ts
 * const report = applyFilePlan(root, withConfirmations(plan, confirmed), (applyId) => saveState(next, applyId));
 * ```
 */
export function applyFilePlan(
  root: ProjectRoot,
  plan: FilePlan,
  commit: (applyId: string) => void,
): ApplyReport {
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
  let staged: StagedWrite[];
  try {
    staged = stageWrites(root, plan, journal);
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
    pruneFailures = commitFiles(root, plan, staged, journal.backupDir);
    commit(id);
  } catch (error) {
    undoThenThrow(root, journal, error);
  }
  finishApply(root.path, id);
  return {
    written: staged.map((s) => s.write.path),
    removed: plan.removals.map((r) => r.path),
    kept: plan.kept,
    backupDir: journal.backupDir,
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

function commitFiles(
  root: ProjectRoot,
  plan: FilePlan,
  staged: StagedWrite[],
  backupDir: string,
): PruneFailure[] {
  /* Copies go only into a real .courier/backups inside the project. */
  if (plan.removals.length > 0 || staged.some((s) => s.existed))
    ensureCourierSubdir(root.path, "backups");
  backUp(
    root,
    backupDir,
    staged.filter((s) => s.existed).map((s) => ({ path: s.write.path, absolute: s.absolute })),
  );
  for (const s of staged) {
    retryOnWin32(() => renameSync(s.temp, s.absolute), `Writing ${s.write.path}`);
    syncDirectory(dirname(s.absolute));
  }
  const removed: string[] = [];
  for (const removal of plan.removals) {
    const absolute = resolveProjectPath(root.path, removal.path);
    refuseObstacle(root, absolute, removal.path);
    const copy = backupPath(root, backupDir, removal.path);
    ensureDirectory(root, dirname(copy));
    retryOnWin32(() => renameSync(absolute, copy), `Moving ${removal.path} into the backup`);
    removed.push(absolute);
  }
  return pruneEmptyDirs(root.path, resolveProjectPath(root.path, plan.dir), removed);
}
