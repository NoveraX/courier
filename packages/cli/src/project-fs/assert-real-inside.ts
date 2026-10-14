import { lstatSync } from "node:fs";
import { relative } from "node:path";
import { errnoCode } from "../util/errno-code";
import { assertResolvesInside } from "./assert-resolves-inside";
import { PathOutsideProjectError } from "./path-outside-project-error";
import type { ProjectRoot } from "./project-root";

/**
 * Make sure writing, replacing or removing a file touches that file, inside
 * the project: every directory on the way resolves inside it, and the path
 * itself is not a symbolic link — Courier never writes through one, replaces
 * one or removes one.
 *
 * @param root - The project
 * @param path - An absolute path inside `root.path` by name
 * @throws {PathOutsideProjectError} When the path is a link or leads outside the project
 * @throws The file system's error when a part of the path cannot be read
 * @example
 * ```ts
 * assertRealInside(root, join(root.path, "src/api/pets/index.ts"));
 * ```
 */
export function assertRealInside(root: ProjectRoot, path: string): void {
  if (isLink(path)) {
    throw new PathOutsideProjectError(relative(root.path, path), "it is a symbolic link");
  }
  assertResolvesInside(root, path);
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
