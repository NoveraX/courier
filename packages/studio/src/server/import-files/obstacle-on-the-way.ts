import { lstatSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { ProjectRoot } from "@noverax/courier-cli/devkit";
import { errnoCode } from "@noverax/courier-cli/devkit";

/** What stands on the way to a path: a symbolic link, or something other than a folder. */
export type Obstacle = "link" | "not-a-file";

/**
 * Find what stands between the project root and a path, folder by folder,
 * without following anything: a symbolic link — wherever it leads, inside
 * the project or out of it, dangling or not — or a file where a folder
 * should be. Folders not there yet stand in nothing's way.
 *
 * @param root - The project
 * @param absolute - A path inside the project, by name
 * @returns The obstacle, or `null` when every folder on the way is a real folder or absent
 * @throws The file system's error for anything but a missing folder
 * @example
 * ```ts
 * obstacleOnTheWay(root, join(root.path, "src/api/pets/index.ts")); // "link" when src/api is one
 * ```
 */
export function obstacleOnTheWay(root: ProjectRoot, absolute: string): Obstacle | null {
  const folders = relative(root.path, absolute).split(sep).slice(0, -1);
  let at = root.path;
  for (const folder of folders) {
    at = join(at, folder);
    let stats: ReturnType<typeof lstatSync>;
    try {
      stats = lstatSync(at);
    } catch (error) {
      if (errnoCode(error) === "ENOENT") return null;
      throw error;
    }
    if (stats.isSymbolicLink()) return "link";
    if (!stats.isDirectory()) return "not-a-file";
  }
  return null;
}
