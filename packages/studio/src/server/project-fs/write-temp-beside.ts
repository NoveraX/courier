import { randomBytes } from "node:crypto";
import { closeSync, fchmodSync, fsyncSync, openSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createLogger } from "@noverax/courier";
import { discardTemp } from "./discard-temp";

const log = createLogger("Studio");

/**
 * Write content to a new temporary file beside a file, flushed to disk,
 * ready to take that file's name.
 *
 * The name is new — the prefix, this process's id and random bytes — and the
 * file is opened with `O_EXCL`, so nothing already there, a planted link
 * included, is ever written through. Content is flushed before the file
 * takes the target's name, so a crash cannot leave that name on bytes that
 * never reached the disk. When the write fails, the temporary file is removed.
 *
 * @param path - The file the temporary file stands in for
 * @param content - What to write
 * @param mode - The exact permission bits to give it; `null` for the ones the umask gives any new file
 * @param prefix - The start of the temporary file's name, which tells whose file a leftover is
 * @returns The temporary file's path, named `<prefix>.<pid>-<8 hex>.tmp`
 * @throws The file system's error when the file cannot be written
 * @example
 * ```ts
 * const tmp = writeTempBeside(target.path, plan.text, target.mode, ".courier.mocks");
 * ```
 */
export function writeTempBeside(
  path: string,
  content: string | Buffer,
  mode: number | null,
  prefix: string,
): string {
  const tmp = join(dirname(path), `${prefix}.${process.pid}-${randomBytes(4).toString("hex")}.tmp`);
  /* The mode given to open is cut by the umask; fchmod sets it exactly. */
  const fd = openSync(tmp, "wx", mode === null ? 0o666 : 0o600);
  try {
    writeFileSync(fd, content);
    if (mode !== null) fchmodSync(fd, mode);
    fsyncSync(fd);
  } catch (error) {
    closeAfterFailure(fd, tmp);
    discardTemp(tmp);
    throw error;
  }
  try {
    closeSync(fd);
  } catch (error) {
    discardTemp(tmp);
    throw error;
  }
  return tmp;
}

function closeAfterFailure(fd: number, tmp: string): void {
  try {
    closeSync(fd);
  } catch (error) {
    log.warn(`Could not close ${tmp} after its write failed`, error);
  }
}
