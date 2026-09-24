import {
  closeSync,
  constants,
  fstatSync,
  futimesSync,
  openSync,
  readFileSync,
  utimesSync,
} from "node:fs";
import { createLogger } from "@noverax/courier";
import { decodeTransformEntry } from "./decode-transform-entry";
import { errnoCode } from "./errno-code";
import { whyUntrusted } from "./why-untrusted";

const log = createLogger("Studio");

/* Not following a link, so an entry replaced by a link is refused at the
   open; not blocking, so a FIFO put in its place opens at once and is then
   refused by its fstat. Windows has neither flag: a named pipe cannot sit at
   a file's path there, and a link followed gives nothing away, since Windows
   has no owner check and whoever can place a link can place a file. */
const READ_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);

/* Nothing at the name, or a file where the directory should be: either way
   there is no entry, and the first write reports why it cannot make one. */
const ABSENT_CODES: ReadonlySet<string> = new Set(["ENOENT", "ENOTDIR"]);

/* What an open that refuses to follow a link reports: ELOOP on Linux and
   macOS, EMLINK on FreeBSD. */
const LINK_CODES: ReadonlySet<string> = new Set(["ELOOP", "EMLINK"]);

function openEntry(path: string): number | null {
  try {
    return openSync(path, READ_FLAGS);
  } catch (error) {
    const code = errnoCode(error);
    if (code !== undefined && ABSENT_CODES.has(code)) return null;
    if (code === undefined || !LINK_CODES.has(code)) throw error;
    log.debug(`Transform cache: ignoring ${path}, a symbolic link`);
    return null;
  }
}

/* Through the descriptor the entry was read from, so the file marked is the
   one that was read even if its name was replaced meanwhile. Windows sets a
   file's times only through a handle opened to write, so there the entry is
   marked by its name; the open there follows a link as this does. */
function markUsed(fd: number, path: string): void {
  try {
    const now = new Date();
    if (process.platform === "win32") utimesSync(path, now, now);
    else futimesSync(fd, now, now);
  } catch (error) {
    log.debug(`Transform cache: cannot mark ${path} as used`, error);
  }
}

function readOpenEntry(fd: number, path: string, digest: string, mark: boolean): string | null {
  const reason = whyUntrusted(fstatSync(fd), "file");
  if (reason !== null) {
    log.debug(`Transform cache: ignoring ${path}, ${reason}`);
    return null;
  }
  const entry = decodeTransformEntry(readFileSync(fd), digest);
  if (entry.state === "damaged") {
    log.debug(`Transform cache: ignoring ${path}, whose body does not match its header`);
  }
  if (entry.state !== "hit") return null;
  if (mark) markUsed(fd, path);
  return entry.code;
}

/**
 * Read the transform of one input from its entry.
 *
 * The entry is read through one descriptor, opened without blocking and, on
 * POSIX, without following a link. It is used only when it is a regular
 * file — on POSIX also owned by this user and writable by no one else — and
 * when it holds exactly that input's transform. A link, another kind of
 * file, an untrusted owner or mode, and a damaged body are logged at debug
 * level; a stale or missing entry is not. On Windows a link is followed, and
 * what it leads to is judged like the entry itself.
 *
 * @param path - The entry's path
 * @param digest - The digest of the input being transformed
 * @param mark - Whether a hit updates the entry's modification time, which
 *   keeps an entry in use from being pruned
 * @returns The kept code, or `null` on a miss
 * @throws The file system's error for anything else, such as `EACCES`
 * @example
 * ```ts
 * const code = readTransformEntry(join(directory, `${name}.js`), digest, true);
 * ```
 */
export function readTransformEntry(path: string, digest: string, mark: boolean): string | null {
  const fd = openEntry(path);
  if (fd === null) return null;
  try {
    return readOpenEntry(fd, path, digest, mark);
  } finally {
    closeSync(fd);
  }
}
