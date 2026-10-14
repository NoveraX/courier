import { join } from "node:path";
import type { ProjectRoot } from "@noverax/courier-cli/devkit";
import { resolveProjectPath } from "@noverax/courier-cli/devkit";

/**
 * Where an apply keeps its copy of a project file: the same relative path
 * under the apply's backup directory.
 *
 * @param root - The project
 * @param backupDir - The apply's backup directory, project-relative
 * @param path - The file, project-relative
 * @returns The absolute path of the copy
 * @throws {PathOutsideProjectError} When either path would leave the project
 */
export function backupPath(root: ProjectRoot, backupDir: string, path: string): string {
  return resolveProjectPath(root.path, join(backupDir, path));
}
