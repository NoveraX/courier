import { lstatSync, mkdirSync } from "node:fs";
import { dirname, relative } from "node:path";
import { errnoCode } from "../util/errno-code";
import { assertResolvesInside } from "./assert-resolves-inside";
import { PathOutsideProjectError } from "./path-outside-project-error";
import type { ProjectRoot } from "./project-root";

/**
 * Create a directory inside the project and the ones above it that are
 * missing, one at a time, checking before and after that none of them
 * leads outside the project through a symbolic link.
 *
 * @param root - The project
 * @param directory - An absolute directory inside `root.path` by name
 * @returns The directories it created, outermost first; none when all existed
 * @throws {PathOutsideProjectError} When a directory on the way leads outside the project or is not a directory
 * @throws The file system's error when a directory cannot be created
 * @example
 * ```ts
 * ensureDirectory(root, join(root.path, "src/api/pets"));
 * ```
 */
export function ensureDirectory(root: ProjectRoot, directory: string): string[] {
  assertResolvesInside(root, directory);
  const created: string[] = [];
  for (const missing of missingDirectories(directory)) {
    try {
      mkdirSync(missing);
      created.push(missing);
    } catch (error) {
      if (errnoCode(error) !== "EEXIST") throw error;
    }
    if (!lstatSync(missing).isDirectory()) {
      throw new PathOutsideProjectError(relative(root.path, missing), "it is not a directory");
    }
  }
  assertResolvesInside(root, directory);
  return created;
}

/**
 * The directories on the way to a directory that do not exist yet,
 * outermost first: those `ensureDirectory` would create.
 *
 * @param directory - The directory, absolute
 * @returns The missing directories, absolute, outermost first
 * @example
 * ```ts
 * missingDirectories("/project/src/api/pets"); // → ["/project/src/api", "/project/src/api/pets"]
 * ```
 */
export function missingDirectories(directory: string): string[] {
  const missing: string[] = [];
  let current = directory;
  while (!exists(current)) {
    missing.unshift(current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return missing;
}

function exists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (errnoCode(error) === "ENOENT") return false;
    throw error;
  }
}
