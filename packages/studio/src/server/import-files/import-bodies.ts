import { relative, sep } from "node:path";
import { assertResolvesInside } from "../project-fs/assert-resolves-inside";
import { PathOutsideProjectError } from "../project-fs/path-outside-project-error";
import type { ProjectRoot } from "../project-fs/project-root";
import { resolveProjectPath } from "../project-fs/resolve-project-path";
import { readDiskFile } from "./disk-file";
import { walkTsFiles } from "./walk-ts-files";

/**
 * Read every `.ts` file in an import's directory as the merge and manage
 * code read them: by project-relative `/` path, without Studio's header,
 * never through a link. A directory that leads outside the project holds
 * nothing.
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
    const disk = readDiskFile(file);
    if (disk.kind === "file") bodies.set(relative(root.path, file).split(sep).join("/"), disk.body);
  });
  return Object.fromEntries(bodies);
}
