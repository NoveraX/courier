import { lstatSync } from "node:fs";
import type { ProjectRoot } from "@noverax/courier-cli/devkit";
import {
  assertOpenedInside,
  errnoCode,
  NotRegularFileError,
  PathOutsideProjectError,
  type RegularFile,
  readRegularFile,
} from "@noverax/courier-cli/devkit";
import { bodyHash } from "./body-hash";
import { exactHash } from "./exact-hash";
import { type GeneratedHeader, readGeneratedFile } from "./generated-header";

/** A path in the project as Studio found it, without following a link at it. */
export type DiskFile =
  | { kind: "absent" }
  | { kind: "link" }
  | { kind: "not-a-file"; found: string }
  | {
      kind: "file";
      /** The content without Studio's header. */
      body: string;
      /** The SHA-256 of the body, line endings as `\n`. */
      sha256: string;
      /** The SHA-256 of the file's exact bytes, Studio's header and line endings included. */
      exact: string;
      /** Studio's header, when the file has a well-formed one. */
      header: GeneratedHeader | null;
      /** The device and inode, which tell two spellings of one file apart from two files. */
      identity: { dev: bigint; ino: bigint };
    };

/**
 * Read a project file for planning, never through a link at it, never
 * blocking on a FIFO, and never from outside the project: once the file is
 * open, its path must still lead to it inside the project, so a folder on
 * the way swapped for a link to elsewhere meanwhile counts as a link. What
 * is at the path, and for a regular file its body, header and identity.
 *
 * @param root - The project
 * @param path - The absolute path, inside the project
 * @returns What is there
 * @throws The file system's error for anything but a missing path, a link or a non-file
 * @example
 * ```ts
 * const found = readDiskFile(root, join(root.path, "src/api/pets/index.ts"));
 * if (found.kind === "file") console.log(found.header?.import);
 * ```
 */
export function readDiskFile(root: ProjectRoot, path: string): DiskFile {
  if (isLink(path)) return { kind: "link" };
  let file: RegularFile | null;
  try {
    file = readRegularFile(path, (fd) => assertOpenedInside(root, path, fd));
  } catch (error) {
    return refusedAs(error);
  }
  if (file === null) return { kind: "absent" };
  const { header, body } = readGeneratedFile(file.bytes.toString("utf8"));
  const stats = lstatSync(path, { bigint: true });
  return {
    kind: "file",
    body,
    sha256: bodyHash(body),
    exact: exactHash(file.bytes),
    header,
    identity: { dev: stats.dev, ino: stats.ino },
  };
}

/* What a refused read finds at the path; any other failure is the file system's to tell. */
function refusedAs(error: unknown): DiskFile {
  if (error instanceof NotRegularFileError) return { kind: "not-a-file", found: error.message };
  /* A folder on the way, or the file itself, became a link or another file while it opened. */
  if (error instanceof PathOutsideProjectError) return { kind: "link" };
  /* Removed once it was open: the path holds nothing now. */
  if (errnoCode(error) === "ENOENT") return { kind: "absent" };
  throw error;
}

function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch (error) {
    const code = errnoCode(error);
    if (code === "ENOENT" || code === "ENOTDIR") return false;
    throw error;
  }
}
