import { renameSync } from "node:fs";
import { dirname } from "node:path";
import type { ProjectRoot } from "@noverax/courier-cli/devkit";
import {
  ensureDirectory,
  flushDirectories,
  resolveProjectPath,
  retryOnWin32,
} from "@noverax/courier-cli/devkit";
import { ensureCourierSubdir } from "../courier-dir";
import { backUp } from "./back-up";
import { backupPath } from "./backup-path";
import type { FilePlan } from "./file-plan-types";
import { type PruneFailure, pruneEmptyDirs } from "./prune-empty-dirs";
import { refuseObstacle, type StagedWrite } from "./stage-writes";

/**
 * Put an apply's staged files in place and move the files it removes into
 * its backup, after keeping a copy of every file it replaces. The staged
 * files take their names one after the other, at once; the folders that
 * name them are then flushed together, each once, off the thread that
 * serves requests. Folders the removals empty are removed.
 *
 * @param root - The project
 * @param plan - The plan, confirmations taken in
 * @param staged - Its writes, staged and on disk
 * @param backupDir - The apply's backup folder, project-relative
 * @returns The emptied folders that could not be removed
 * @throws The file system's error, for the caller to undo the apply
 * @example
 * ```ts
 * const pruneFailures = await commitFiles(root, plan, staged, journal.backupDir);
 * ```
 */
export async function commitFiles(
  root: ProjectRoot,
  plan: FilePlan,
  staged: readonly StagedWrite[],
  backupDir: string,
): Promise<PruneFailure[]> {
  /* Copies go only into a real .courier/backups inside the project. */
  if (plan.removals.length > 0 || staged.some((s) => s.existed)) {
    ensureCourierSubdir(root.path, "backups");
  }
  const replaced = staged.filter((s) => s.existed);
  await backUp(
    root,
    backupDir,
    replaced.map((s) => ({ path: s.write.path, absolute: s.absolute })),
  );
  for (const s of staged) {
    retryOnWin32(() => renameSync(s.temp, s.absolute), `Writing ${s.write.path}`);
  }
  await flushDirectories(staged.map((s) => dirname(s.absolute)));
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
