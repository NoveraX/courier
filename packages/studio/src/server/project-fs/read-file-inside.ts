import { constants, type Stats } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { relative } from "node:path";
import { errnoCode } from "../errno-code";
import { NotRegularFileError } from "../not-regular-file-error";
import { assertOpenedInside } from "./assert-opened-inside";
import { isWithin } from "./is-within";
import { PathOutsideProjectError } from "./path-outside-project-error";
import type { ProjectRoot } from "./project-root";

/* The place a link leads to is opened, not the link, and without blocking
   on a FIFO swapped in meanwhile; Windows has neither flag, and the check
   once the file is open finds a swap there too. */
const READ_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);

/** A file of the project, read through one descriptor. */
export interface FileInside {
  /** The file's bytes. */
  bytes: Buffer;
  /** The `fstat` of the descriptor the bytes were read through. */
  stats: Stats;
}

/**
 * Read a file of the project as the project's own code reaches it, without
 * blocking the event loop: a link at the path, or on the way, is followed
 * while it leads to a place inside the project, and refused when it leads
 * out. Once the file is open, its path must still lead to that very file
 * inside the project, so a folder swapped for a link meanwhile reads nothing.
 *
 * @param root - The project
 * @param path - The file's absolute path, inside the project by name
 * @returns Its bytes and stats, or `null` when there is nothing at the path
 * @throws {PathOutsideProjectError} When the path leads outside the project, or was swapped while it opened
 * @throws {NotRegularFileError} When the path leads to a directory, a FIFO or anything but a regular file
 * @throws The file system's error for anything else, such as `EACCES`
 * @example
 * ```ts
 * const file = await readFileInside(root, join(root.path, "src/app.ts"));
 * if (file !== null) codeCalls("src/app.ts", file.bytes.toString("utf8"));
 * ```
 */
export async function readFileInside(root: ProjectRoot, path: string): Promise<FileInside | null> {
  const real = await placeOf(path);
  if (real === null) return null;
  if (!isWithin(root.real, real)) {
    const shown = relative(root.path, path);
    throw new PathOutsideProjectError(
      shown,
      "a symbolic link on the way leads outside the project",
    );
  }
  const handle = await open(real, READ_FLAGS);
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) throw new NotRegularFileError(relative(root.path, path), kindOf(stats));
    assertOpenedInside(root, path, handle.fd);
    return { bytes: await handle.readFile(), stats };
  } finally {
    await handle.close();
  }
}

async function placeOf(path: string): Promise<string | null> {
  try {
    return await realpath(path);
  } catch (error) {
    if (errnoCode(error) === "ENOENT") return null;
    throw error;
  }
}

function kindOf(stats: Stats): string {
  return stats.isDirectory() ? "a directory" : "something other than a file";
}
