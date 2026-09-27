import { renameSync } from "node:fs";
import { dirname } from "node:path";
import { discardTemp } from "./discard-temp";
import { retryOnWin32 } from "./retry-on-win32";
import { syncDirectory } from "./sync-directory";
import { writeTempBeside } from "./write-temp-beside";

/**
 * Replace a file's content all at once: the content goes to a new temporary
 * file beside it, flushed, which then takes the file's name, retrying on
 * Windows while another process holds the file. A reader sees the old
 * content or the new, never part of either; a failure leaves the old.
 *
 * @param path - The file, absolute
 * @param content - Its new content
 * @param prefix - The start of the temporary file's name
 * @throws The file system's error when the file cannot be written
 * @example
 * ```ts
 * writeFileAtomically(join(root, ".courier/imports-state.json"), json, ".courier.state");
 * ```
 */
export function writeFileAtomically(path: string, content: string, prefix: string): void {
  const temp = writeTempBeside(path, content, null, prefix);
  try {
    retryOnWin32(() => renameSync(temp, path), `Renaming ${temp} to ${path}`);
  } catch (error) {
    discardTemp(temp);
    throw error;
  }
  syncDirectory(dirname(path));
}
