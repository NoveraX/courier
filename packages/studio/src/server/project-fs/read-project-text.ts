import { readRegularFile } from "../read-regular-file";
import { assertRealInside } from "./assert-real-inside";
import { ProjectFileMissingError } from "./project-file-missing-error";
import type { ProjectRoot } from "./project-root";
import { resolveProjectPath } from "./resolve-project-path";

/**
 * Read a text file a request names in the project: only a regular file,
 * reached through no link that leads out of the project, and never through
 * a link at the file itself.
 *
 * @param root - The project
 * @param path - The file, relative to the project root
 * @returns Its text
 * @throws {PathOutsideProjectError} When the path, or where it leads, is outside the project
 * @throws {ProjectFileMissingError} When there is no such file
 * @throws {NotRegularFileError} When it is not a regular file
 * @example
 * ```ts
 * const raw = readProjectText(projectRootAt(root), "specs/pets.yaml");
 * ```
 */
export function readProjectText(root: ProjectRoot, path: string): string {
  const absolute = resolveProjectPath(root.path, path);
  assertRealInside(root, absolute);
  const file = readRegularFile(absolute);
  if (file === null) throw new ProjectFileMissingError(path);
  return file.bytes.toString("utf8");
}
