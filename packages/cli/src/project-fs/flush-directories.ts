import { createLogger } from "@noverax/courier";
import { flushFiles } from "./flush-files";

const log = createLogger("Project");

/**
 * Flush directories, so the renames, links and removals in them survive a
 * power loss, several at a time and off the thread that serves requests.
 * Each directory is flushed once, however many names changed in it.
 *
 * Windows cannot open a directory for that, and its file system journals
 * the rename itself. The files are in place when this runs, so a failure
 * costs only durability across a power loss: it is logged, not thrown.
 *
 * @param directories - The directories that hold the changed names
 * @returns Once every directory that could be flushed is
 * @example
 * ```ts
 * for (const s of staged) renameSync(s.temp, s.absolute);
 * await flushDirectories(staged.map((s) => dirname(s.absolute)));
 * ```
 */
export async function flushDirectories(directories: Iterable<string>): Promise<void> {
  if (process.platform === "win32") return;
  await flushFiles(new Set(directories), (directory, error) => {
    log.debug(`Could not flush ${directory} after changing names in it`, error);
  });
}
