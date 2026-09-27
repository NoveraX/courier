import { lstatSync } from "node:fs";
import { errnoCode } from "../errno-code";
import { NotRegularFileError } from "../not-regular-file-error";
import { readRegularFile } from "../read-regular-file";
import { bodyHash } from "./body-hash";
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
      /** Studio's header, when the file has a well-formed one. */
      header: GeneratedHeader | null;
      /** The device and inode, which tell two spellings of one file apart from two files. */
      identity: { dev: bigint; ino: bigint };
    };

/**
 * Read a project file for planning, never through a link and never
 * blocking on a FIFO: what is at the path, and for a regular file its body,
 * header and identity.
 *
 * @param path - The absolute path
 * @returns What is there
 * @throws The file system's error for anything but a missing path, a link or a non-file
 * @example
 * ```ts
 * const found = readDiskFile(join(root.path, "src/api/pets/index.ts"));
 * if (found.kind === "file") console.log(found.header?.import);
 * ```
 */
export function readDiskFile(path: string): DiskFile {
  if (isLink(path)) return { kind: "link" };
  let file: ReturnType<typeof readRegularFile>;
  try {
    file = readRegularFile(path);
  } catch (error) {
    if (error instanceof NotRegularFileError) return { kind: "not-a-file", found: error.message };
    throw error;
  }
  if (file === null) return { kind: "absent" };
  const { header, body } = readGeneratedFile(file.bytes.toString("utf8"));
  const stats = lstatSync(path, { bigint: true });
  return {
    kind: "file",
    body,
    sha256: bodyHash(body),
    header,
    identity: { dev: stats.dev, ino: stats.ino },
  };
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
