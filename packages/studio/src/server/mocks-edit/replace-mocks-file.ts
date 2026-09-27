import { renameSync } from "node:fs";
import { dirname } from "node:path";
import { discardTemp } from "../project-fs/discard-temp";
import { retryOnWin32 } from "../project-fs/retry-on-win32";
import { syncDirectory } from "../project-fs/sync-directory";
import { writeTempBeside } from "../project-fs/write-temp-beside";
import { hashMocksFile } from "./hash-mocks-file";
import { MocksFileChangedError } from "./mocks-file-changed-error";
import { MOCKS_TEMP_PREFIX } from "./mocks-temp-name";

/** How {@link replaceMocksFile} writes the edited file. */
export interface ReplaceMocksFileOptions {
  /** The permission bits the file keeps, as `stat.mode & 0o7777`. */
  mode: number;
  /** sha256 of the file the edit was planned against. */
  expectedHash: string;
}

/**
 * Replace the mocks file with its edited content, atomically: the content is
 * written and flushed to a temporary file beside it, which is renamed over
 * the file only if the file is still the one the edit was planned against.
 * A reader sees the old file or the new one, never a mix.
 *
 * The check reads the file without following a link and without blocking,
 * so a link, a FIFO or anything else swapped in at its name counts as a
 * change and is left in place rather than read through or waited on.
 *
 * It is synchronous so the caller can tell the file watcher the write is its
 * own in the same tick, before any watcher callback runs.
 *
 * @param path - The mocks file
 * @param content - Its new content
 * @param options - The mode it keeps and the hash it must still have
 * @throws {MocksFileChangedError} When the file changed since the edit was planned, or is gone
 * @throws The file system's error when the write fails; the file is then untouched
 * @example
 * ```ts
 * replaceMocksFile(target.path, plan.text, { mode: target.mode, expectedHash: target.hash });
 * ```
 */
export function replaceMocksFile(
  path: string,
  content: string | Buffer,
  { mode, expectedHash }: ReplaceMocksFileOptions,
): void {
  const tmp = writeTempBeside(path, content, mode, MOCKS_TEMP_PREFIX);
  try {
    if (hashMocksFile(path) !== expectedHash) throw new MocksFileChangedError(path);
    retryOnWin32(() => renameSync(tmp, path), `Renaming ${tmp} to ${path}`);
  } catch (error) {
    discardTemp(tmp);
    throw error;
  }
  syncDirectory(dirname(path));
}
