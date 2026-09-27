import { copyFileSync, linkSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { loadImportsState } from "../../apis/imports-state";
import { ownValue } from "../../apis/own-value";
import { COURIER_DIR, ensureCourierSubdir } from "../courier-dir";
import { errnoCode } from "../errno-code";
import { ensureDirectory } from "../project-fs/ensure-directory";
import type { ProjectRoot } from "../project-fs/project-root";
import { resolveProjectPath } from "../project-fs/resolve-project-path";
import { retryOnWin32 } from "../project-fs/retry-on-win32";
import { syncDirectory } from "../project-fs/sync-directory";
import { newApplyId } from "./apply-id";
import { type ApplyJournal, saveJournal } from "./apply-journal";
import { backupPath } from "./backup-path";
import { FilePlanError } from "./file-plan-error";
import type { FilePlan } from "./file-plan-types";
import { finishApply } from "./finish-apply";
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
  const id = newApplyId();
  const journal: ApplyJournal = {
    id,
    importName: plan.importName,
    dir: plan.dir,
    after: ownValue(loadImportsState(root.path).imports, plan.importName)?.applyId ?? null,
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
  for (const s of staged) if (s.existed) backUp(root, backupDir, s.write.path, s.absolute);
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

/* A hard link costs nothing; a file system without them gets a copy. */
function backUp(root: ProjectRoot, backupDir: string, path: string, absolute: string): void {
  const copy = backupPath(root, backupDir, path);
  ensureDirectory(root, dirname(copy));
  try {
    linkSync(absolute, copy);
  } catch (error) {
    const code = errnoCode(error);
    if (code !== "EXDEV" && code !== "EPERM" && code !== "ENOTSUP" && code !== "EMLINK")
      throw error;
    copyFileSync(absolute, copy);
  }
}
