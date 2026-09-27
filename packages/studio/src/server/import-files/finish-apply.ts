import { createLogger } from "@noverax/courier";
import { dropJournal, JOURNAL_DIR } from "./apply-journal";
import { pruneBackups } from "./prune-backups";

const log = createLogger("Studio");

/**
 * Tidy up after an apply that committed: drop its journal and the oldest
 * backups. The apply stands whatever happens here, so a failure is logged,
 * not thrown: a journal left behind names an apply the imports state
 * recorded, which the next start drops instead of undoing.
 *
 * @param root - The project directory
 * @param applyId - The apply that committed
 * @example
 * ```ts
 * commit(applyId);
 * finishApply(root.path, applyId);
 * ```
 */
export function finishApply(root: string, applyId: string): void {
  try {
    dropJournal(root, applyId);
  } catch (error) {
    log.warn(
      `Studio applied the plan but could not delete ${JOURNAL_DIR}/${applyId}.json; the next start deletes it`,
      error,
    );
  }
  try {
    pruneBackups(root);
  } catch (error) {
    log.warn("Studio could not delete the oldest backups of import writes", error);
  }
}
