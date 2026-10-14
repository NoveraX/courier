import { relative, sep } from "node:path";
import type { ProjectRoot } from "@noverax/courier-cli/devkit";
import {
  assertResolvesInside,
  PathOutsideProjectError,
  resolveProjectPath,
} from "@noverax/courier-cli/devkit";
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
