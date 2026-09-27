import { createLogger } from "@noverax/courier";
import { loadImportsState } from "../../apis/imports-state";
import { projectRootAt } from "../project-fs/project-root";
import { recoverInterruptedApplies } from "./recover-interrupted-applies";
import { sweepCourierTemps } from "./sweep-courier-temps";

const log = createLogger("Studio");

/**
 * Undo, before any route can read an import's files, a write to them that a
 * crash or a kill cut short before the imports state recorded it, and delete
 * the temporary files such a crash left. Studio still starts when that
 * fails: the failure is logged and the journal stays, to be undone on the
 * next start.
 *
 * @param root - The project root, symlinks resolved
 * @example
 * ```ts
 * undoUnfinishedImportWrites(root);
 * registerRestApi(app, policy, deps);
 * ```
 */
export function undoUnfinishedImportWrites(root: string): void {
  try {
    recoverInterruptedApplies(projectRootAt(root), loadImportsState(root));
    sweepCourierTemps(root);
  } catch (error) {
    log.warn(
      "Studio could not undo an unfinished import write; its journal is in .courier/journal",
      error,
    );
  }
}
