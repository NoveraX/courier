import { relative, sep } from "node:path";
import { assertResolvesInside } from "../project-fs/assert-resolves-inside";
import { PathOutsideProjectError } from "../project-fs/path-outside-project-error";
import type { ProjectRoot } from "../project-fs/project-root";
import { resolveProjectPath } from "../project-fs/resolve-project-path";
import { readDiskFile } from "./disk-file";
import { walkTsFiles } from "./walk-ts-files";

/**
 * Find the files in an import's directory whose header says Studio wrote
 * them for that import — its files in a clone where Studio has no record.
 * Links are not followed; a directory that leads outside the project holds
 * none, and nor does a folder that became a link while it was read.
 *
 * @param root - The project
 * @param dir - The import's directory, project-relative
 * @param importName - The import
 * @returns Their project-relative `/` paths
 * @example
 * ```ts
 * claimedFiles(root, layout.dir, "pets"); // ["src/api/pets/index.ts", …]
 * ```
 */
export function claimedFiles(root: ProjectRoot, dir: string, importName: string): string[] {
  const absolute = resolveProjectPath(root.path, dir);
  try {
    assertResolvesInside(root, absolute);
  } catch (error) {
    if (error instanceof PathOutsideProjectError) return [];
    throw error;
  }
  const found: string[] = [];
  walkTsFiles(absolute, (file) => {
    const disk = readDiskFile(root, file);
    if (disk.kind === "file" && disk.header?.import === importName) {
      found.push(relative(root.path, file).split(sep).join("/"));
    }
  });
  return found.sort();
}
