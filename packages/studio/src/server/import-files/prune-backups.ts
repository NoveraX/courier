import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "@noverax/courier";
import { COURIER_DIR } from "../courier-dir";
import { errnoCode } from "../errno-code";

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
 */
export function pruneBackups(root: string, keep: number = KEPT_BACKUPS): string[] {
  const dir = join(root, COURIER_DIR, "backups");
  let names: string[];
  try {
    names = readdirSync(dir).sort();
  } catch (error) {
    if (errnoCode(error) === "ENOENT") return [];
    throw error;
  }
  const deleted = names
    .slice(0, Math.max(0, names.length - keep))
    .map((name) => `${COURIER_DIR}/backups/${name}`);
  for (const backup of deleted) rmSync(join(root, backup), { recursive: true, force: true });
  if (deleted.length > 0)
    log.debug(`Studio deleted ${deleted.length} old backups of import writes`);
  return deleted;
}
