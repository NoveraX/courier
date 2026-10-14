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
 * Read every `.ts` file in an import's directory as the merge and manage
 * code read them: by project-relative `/` path, without Studio's header,
 * never through a link. A directory that leads outside the project holds
 * nothing, and a file whose folder became a link to elsewhere while it was
 * read is not read.
 *
 * @param root - The project
 * @param dir - The import's directory, project-relative
 * @returns Each file's body, by path
 * @example
 * ```ts
 * const existing = importBodies(root, layout.dir);
 * ```
 */
export function importBodies(root: ProjectRoot, dir: string): Record<string, string> {
  const absolute = resolveProjectPath(root.path, dir);
  try {
    assertResolvesInside(root, absolute);
  } catch (error) {
    if (error instanceof PathOutsideProjectError) return {};
    throw error;
  }
  const bodies = new Map<string, string>();
  walkTsFiles(absolute, (file) => {
    const disk = readDiskFile(root, file);
    if (disk.kind === "file") bodies.set(relative(root.path, file).split(sep).join("/"), disk.body);
  });
  return Object.fromEntries(bodies);
}
