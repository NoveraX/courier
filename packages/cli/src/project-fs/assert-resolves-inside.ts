import { lstatSync, realpathSync } from "node:fs";
import { dirname, relative } from "node:path";
import { errnoCode } from "../util/errno-code";
import { assertNamedInside } from "./assert-named-inside";
import { isWithin } from "./is-within";
import { PathOutsideProjectError } from "./path-outside-project-error";
import type { ProjectRoot } from "./project-root";

/**
 * Make sure a path inside the project by name is inside it on disk too: the
 * deepest part of it that exists is resolved with `realpath`, so a directory
 * on the way that is a symbolic link counts where it leads. A link that
 * stays in the project is fine; one that leads out is refused.
 *
 * @param root - The project
 * @param path - An absolute path inside `root.path` by name
 * @throws {PathOutsideProjectError} When the path, by its name or where it leads, is outside the project
 * @throws The file system's error when a part of the path cannot be read
 * @example
 * ```ts
 * assertResolvesInside(root, join(root.path, "src/api/pets"));
 * ```
 */
export function assertResolvesInside(root: ProjectRoot, path: string): void {
  assertNamedInside(root, path);
  const existing = deepestExisting(path);
  if (isWithin(root.real, realpathSync.native(existing))) return;
  const shown = relative(root.path, path) || ".";
  throw new PathOutsideProjectError(shown, "a symbolic link on the way leads outside the project");
}

function deepestExisting(path: string): string {
  let current = path;
  for (;;) {
    try {
      lstatSync(current);
      return current;
    } catch (error) {
      const code = errnoCode(error);
      if (code !== "ENOENT" && code !== "ENOTDIR") throw error;
      const parent = dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
}
