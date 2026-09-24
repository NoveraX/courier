import { linkSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { createLogger } from "@noverax/courier";
import { errnoCode } from "../errno-code";
import { discardTemp } from "./discard-temp";
import { MocksFileChangedError } from "./mocks-file-changed-error";
import { retryOnWin32 } from "./retry-on-win32";
import { syncDirectory } from "./sync-directory";
import { writeTempBeside } from "./write-temp-beside";

const log = createLogger("Studio");

/**
 * Create the mocks file, never over one that appeared meanwhile: the content
 * is written and flushed to a temporary file, which is then linked in under
 * the file's name — a link, unlike a rename, fails when the name is taken,
 * a dangling link included. The file gets the mode the umask gives any new
 * file.
 *
 * Once the file exists, the temporary file is only a second name for it. If
 * that name cannot be removed, the file is still created, and the leftover
 * is returned for the caller to name to the user: until it is deleted, the
 * file has two names, and Studio will not replace a file with two.
 *
 * @param path - The mocks file to create
 * @param content - Its content
 * @returns The absolute path of a temporary file it could not remove, or `null`
 * @throws {MocksFileChangedError} When a file of that name appeared meanwhile
 * @throws The file system's error when the write fails; nothing is created then
 * @example
 * ```ts
 * const leftover = writeNewMocksFile(join(root, "courier.mocks.ts"), plan.text);
 * ```
 */
export function writeNewMocksFile(path: string, content: string): string | null {
  const tmp = writeTempBeside(path, content, null);
  try {
    linkNew(tmp, path);
  } catch (error) {
    discardTemp(tmp);
    throw error;
  }
  const leftover = removeSecondName(tmp, path);
  syncDirectory(dirname(path));
  return leftover;
}

function linkNew(tmp: string, path: string): void {
  try {
    linkSync(tmp, path);
  } catch (error) {
    if (errnoCode(error) === "EEXIST") throw new MocksFileChangedError(path, { cause: error });
    throw error;
  }
}

function removeSecondName(tmp: string, path: string): string | null {
  try {
    retryOnWin32(() => unlinkSync(tmp), `Removing ${tmp}`);
    return null;
  } catch (error) {
    log.warn(`Created ${path}, but ${tmp} is still a second name for it; delete ${tmp}.`, error);
    return tmp;
  }
}
