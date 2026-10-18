import { relative } from "node:path";
import { isWithin } from "./is-within";
import { PathOutsideProjectError } from "./path-outside-project-error";
import type { ProjectRoot } from "./project-root";

/**
 * Make sure a path lies inside the project by its name, before anything on
 * disk is asked about it: the checks that follow links look the path up,
 * and a path outside the project is not theirs to look up. Every check of
 * this folder starts here, so none relies on its caller to have resolved
 * the path with {@link resolveProjectPath} first.
 *
 * @param root - The project
 * @param path - An absolute path
 * @throws {PathOutsideProjectError} When the path names a place outside `root.path`
 * @example
 * ```ts
 * assertNamedInside(root, join(root.path, "src/api/pets/index.ts")); // passes
 * assertNamedInside(root, "/etc/passwd"); // throws
 * ```
 */
export function assertNamedInside(root: ProjectRoot, path: string): void {
  if (isWithin(root.path, path)) return;
  throw new PathOutsideProjectError(relative(root.path, path), "it is outside the project");
}
