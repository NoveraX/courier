import { randomBytes } from "node:crypto";
import { closeSync, lstatSync, openSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { createLogger } from "@noverax/courier";
import { errnoCode } from "./errno-code";

const log = createLogger("Studio");

/* On Windows, renaming over an entry that another process is reading, or
   that a scanner holds open, fails only while it is open; a later write of
   the same entry can succeed. */
const PASSING_RENAME_CODES: ReadonlySet<string> = new Set(["EPERM", "EBUSY", "EACCES"]);

/* Windows refuses a rename over a folder with the same codes; a folder in
   the entry's place does not go away by itself, so that refusal does not pass. */
function heldOpen(error: unknown, path: string): boolean {
  const code = errnoCode(error);
  if (code === undefined || !PASSING_RENAME_CODES.has(code)) return false;
  return lstatSync(path, { throwIfNoEntry: false })?.isDirectory() !== true;
}

function discard(temporary: string): void {
  try {
    unlinkSync(temporary);
  } catch (error) {
    log.debug(`Transform cache: cannot remove ${temporary}`, error);
  }
}

/* Created exclusively and readable by this user alone, so no other writer
   and no other reader shares its bytes before the rename. */
function writeTemporary(temporary: string, bytes: Buffer): void {
  const fd = openSync(temporary, "wx", 0o600);
  try {
    try {
      writeFileSync(fd, bytes);
    } finally {
      closeSync(fd);
    }
  } catch (error) {
    discard(temporary);
    throw error;
  }
}

/**
 * Replace the entry at `path` with `bytes`, so that a reader sees either the
 * old entry or the whole new one.
 *
 * The bytes go to a temporary file beside the entry, named after it, this
 * process and random bytes, which is then renamed over the entry. On any
 * failure the temporary file is removed. A rename refused because the entry
 * is held open (`EPERM`, `EBUSY` or `EACCES`, while no folder stands in its
 * place) skips this one write, logged at debug level.
 *
 * @param path - The entry's path, in a directory that exists
 * @param bytes - The whole entry
 * @throws The file system's error for any other failure
 * @example
 * ```ts
 * writeTransformEntry(join(directory, `${name}.js`), encodeTransformEntry(digest, code));
 * ```
 */
export function writeTransformEntry(path: string, bytes: Buffer): void {
  const temporary = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  writeTemporary(temporary, bytes);
  try {
    renameSync(temporary, path);
  } catch (error) {
    discard(temporary);
    if (!heldOpen(error, path)) throw error;
    log.debug(`Transform cache: skipped writing ${path} (${errnoCode(error)})`);
  }
}
