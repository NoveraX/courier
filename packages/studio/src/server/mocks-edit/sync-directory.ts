import { closeSync, fsyncSync, openSync } from "node:fs";
import { createLogger } from "@noverax/courier";

const log = createLogger("Studio");

/**
 * Flush a directory, so a rename, link or removal in it survives a power loss.
 *
 * Windows cannot open a directory for that, and its file system journals the
 * rename itself. The file is already written when this runs, so a failure
 * costs only durability across a power loss: it is logged, not thrown.
 *
 * @param directory - The directory that holds the changed name
 * @example
 * ```ts
 * renameSync(tmp, path);
 * syncDirectory(dirname(path));
 * ```
 */
export function syncDirectory(directory: string): void {
  if (process.platform === "win32") return;
  try {
    const fd = openSync(directory, "r");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  } catch (error) {
    log.debug(`Could not flush ${directory} after writing the mocks file`, error);
  }
}
