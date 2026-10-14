import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  type Stats,
} from "node:fs";
import { errnoCode } from "./errno-code";
import { NotRegularFileError } from "./not-regular-file-error";

/* Not following a link, so a link swapped in fails the open; not blocking,
   so a FIFO swapped in opens at once and is then refused by its fstat
   instead of hanging the event loop until a writer appears. Windows has
   neither flag: it has no FIFO at a file's name, and its links are looked
   for once the file is open. */
const READ_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);

/* Where the open itself follows a link at the name. */
const OPENS_THROUGH_LINKS = constants.O_NOFOLLOW === undefined;

/* What an open that refuses to follow a link reports: ELOOP on Linux and
   macOS, EMLINK on FreeBSD. */
const LINK_CODES: ReadonlySet<string> = new Set(["ELOOP", "EMLINK"]);

/** A regular file, read through one descriptor. */
export interface RegularFile {
  /** The file's bytes. */
  bytes: Buffer;
  /** The `fstat` of the descriptor the bytes were read through. */
  stats: Stats;
}

/**
 * Read a regular file without following a link at its name and without
 * blocking on a FIFO, a device or anything else that is not a regular file.
 *
 * The bytes and the stats describe one file, read through one descriptor,
 * even if its name is swapped meanwhile. A caller that must know more of
 * the file opened than its name can say — where it really is — checks the
 * descriptor before a byte is read.
 *
 * @param path - The file
 * @param verify - Checks the descriptor once the file is open, and throws to refuse it
 * @returns Its bytes and stats, or `null` when there is nothing at the path
 * @throws {NotRegularFileError} When the path is a symbolic link or not a regular file
 * @throws The file system's error for anything else, such as `EACCES`
 * @example
 * ```ts
 * const file = readRegularFile(join(root, "courier.mocks.ts"));
 * if (file !== null) console.log(file.bytes.length, file.stats.mode);
 * ```
 */
export function readRegularFile(path: string, verify?: (fd: number) => void): RegularFile | null {
  const fd = openNoFollow(path);
  if (fd === null) return null;
  try {
    if (OPENS_THROUGH_LINKS) refuseLinkAtName(path, fd);
    const stats = fstatSync(fd);
    if (!stats.isFile()) throw new NotRegularFileError(path, describeKind(stats));
    verify?.(fd);
    return { bytes: readFileSync(fd), stats };
  } finally {
    closeSync(fd);
  }
}

/* The name holds a link, or no longer the file that was opened through it:
   either way the descriptor does not read the regular file at the name. */
function refuseLinkAtName(path: string, fd: number): void {
  const named = lstatSync(path, { bigint: true, throwIfNoEntry: false });
  if (named === undefined) return;
  if (named.isSymbolicLink()) throw new NotRegularFileError(path, "a symbolic link");
  const opened = fstatSync(fd, { bigint: true });
  if (named.dev !== opened.dev || named.ino !== opened.ino) {
    throw new NotRegularFileError(path, "a file other than the one opened");
  }
}

function openNoFollow(path: string): number | null {
  try {
    return openSync(path, READ_FLAGS);
  } catch (error) {
    const code = errnoCode(error);
    if (code === "ENOENT") return null;
    if (code !== undefined && LINK_CODES.has(code)) {
      throw new NotRegularFileError(path, "a symbolic link", { cause: error });
    }
    if (code === "EISDIR") throw new NotRegularFileError(path, "a directory", { cause: error });
    throw error;
  }
}

function describeKind(stats: Stats): string {
  if (stats.isDirectory()) return "a directory";
  if (stats.isFIFO()) return "a FIFO";
  if (stats.isSocket()) return "a socket";
  if (stats.isCharacterDevice() || stats.isBlockDevice()) return "a device";
  return "something other than a file";
}
