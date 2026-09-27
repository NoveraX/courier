import type { DiskFile } from "./disk-file";
import type { Ownership } from "./file-plan-types";
import type { RecordedFile } from "./recorded-file";

/**
 * Tell who a path belongs to: Studio, when it recorded writing the file or
 * the file's header names this import; nobody Studio knows of otherwise.
 * Either way, whether the file changed since Studio wrote it.
 *
 * @param disk - What is at the path
 * @param record - What Studio recorded about it for this import, if anything
 * @param importName - The import asking
 * @returns The path's ownership
 * @example
 * ```ts
 * ownershipOf(readDiskFile(abs), entry.files[path], "pets"); // "recorded"
 * ```
 */
export function ownershipOf(
  disk: DiskFile,
  record: RecordedFile | undefined,
  importName: string,
): Ownership {
  if (disk.kind !== "file") return disk.kind;
  if (record !== undefined) return disk.sha256 === record.sha256 ? "recorded" : "recorded-edited";
  if (disk.header?.import !== importName) return "foreign";
  return disk.header.sha256 === disk.sha256 ? "claimed" : "claimed-edited";
}
