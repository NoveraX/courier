import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "@noverax/courier";
import { COURIER_DIR, hasCourierSubdir } from "../courier-dir";
import { isApplyId } from "./apply-id";
import { hasJournal } from "./apply-journal";

const log = createLogger("Studio");

/** How many applies' backups Studio keeps. */
export const KEPT_BACKUPS = 20;

/**
 * Keep the backups of the latest applies and delete older ones. Backup
 * directories are named by the time the apply began, so their names sort
 * oldest first.
 *
 * @param root - The project directory
 * @param keep - How many to keep
 * @returns The backup directories deleted, project-relative
 * @throws {CourierDirUnsafeError} When `.courier` or its backups folder is a link or not a folder
 */
export function pruneBackups(root: string, keep: number = KEPT_BACKUPS): string[] {
  if (!hasCourierSubdir(root, "backups")) return [];
  /* Only a folder named like an apply is one of Studio's backups, and one a journal still names
     is what an undo restores from, so it stays. */
  const names = readdirSync(join(root, COURIER_DIR, "backups"))
    .filter((name) => isApplyId(name) && !hasJournal(root, name))
    .sort();
  const deleted = names
    .slice(0, Math.max(0, names.length - keep))
    .map((name) => `${COURIER_DIR}/backups/${name}`);
  for (const backup of deleted) rmSync(join(root, backup), { recursive: true, force: true });
  if (deleted.length > 0)
    log.debug(`Studio deleted ${deleted.length} old backups of import writes`);
  return deleted;
}
