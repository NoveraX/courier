import { type BigIntStats, fstatSync, realpathSync, statSync } from "node:fs";
import { relative } from "node:path";
import { isWithin } from "./is-within";
import { PathOutsideProjectError } from "./path-outside-project-error";
import type { ProjectRoot } from "./project-root";

/**
 * Make sure a file opened by a path inside the project is the file that
 * path names inside it now. The checks before the open look at the path; a
 * directory on the way swapped for a link to elsewhere between those checks
 * and the open would have the open read a file outside. So once it is open,
 * the path is resolved again and must lie inside the project; the path, and
 * the place it resolved to, must each name the very file the descriptor
 * reads — same device, same inode; and the path must still resolve to that
 * place afterwards, so a swap made between those looks is caught too.
 *
 * Node cannot ask a descriptor where its file is, so this narrows the race
 * to the moments between these calls rather than closing it; each swap has
 * to land between two of them, and back.
 *
 * @param root - The project
 * @param path - The absolute path the file was opened by
 * @param fd - The open file's descriptor, which the caller closes
 * @throws {PathOutsideProjectError} When the path now leads outside the project, or to another file
 * @throws The file system's error when the path no longer resolves
 * @example
 * ```ts
 * readRegularFile(absolute, (fd) => assertOpenedInside(root, absolute, fd));
 * ```
 */
export function assertOpenedInside(root: ProjectRoot, path: string, fd: number): void {
  const shown = relative(root.path, path);
  const real = realpathSync.native(path);
  if (!isWithin(root.real, real)) {
    throw new PathOutsideProjectError(
      shown,
      "a symbolic link on the way leads outside the project",
    );
  }
  const opened = fstatSync(fd, { bigint: true });
  const named = sameFile(statSync(path, { bigint: true }), opened);
  const placed = sameFile(statSync(real, { bigint: true }), opened);
  if (!named || !placed || realpathSync.native(path) !== real) {
    throw new PathOutsideProjectError(shown, "it was replaced while Courier opened it");
  }
}

function sameFile(a: BigIntStats, b: BigIntStats): boolean {
  return a.dev === b.dev && a.ino === b.ino;
}
