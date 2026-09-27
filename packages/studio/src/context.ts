/**
 * Project root context — singleton module storing the user's project path.
 *
 * All file operations in the server resolve relative paths against this root
 * instead of process.cwd(), so studio works correctly regardless of
 * where the server process was started.
 *
 * **Singleton by design**: one studio server per process, one project root.
 * Tests that need isolation should call `resetProjectRoot()` in `afterEach`.
 */

import { relative, resolve } from "node:path";
import { isWithin } from "./server/project-fs/is-within";
import { PathOutsideProjectError } from "./server/project-fs/path-outside-project-error";

let projectRoot = process.cwd();

/** Set the project root directory (called once at server startup) */
export function setProjectRoot(root: string): void {
  projectRoot = resolve(root);
}

/** Get the project root directory */
export function getProjectRoot(): string {
  return projectRoot;
}

/** Resolve a path relative to the project root */
export function resolveProject(...paths: string[]): string {
  return resolve(projectRoot, ...paths);
}

/**
 * Resolve a path relative to the project root with traversal protection.
 *
 * Use this instead of `resolveProject` when paths originate from user input
 * (HTTP request bodies, query params, etc.) to prevent directory traversal attacks.
 *
 * @throws {PathOutsideProjectError} If the resolved path escapes the project root
 */
export function resolveProjectSafe(...paths: string[]): string {
  const resolved = resolve(projectRoot, ...paths);
  if (!isWithin(projectRoot, resolved)) {
    throw new PathOutsideProjectError(relative(projectRoot, resolved), "it leaves the project");
  }
  return resolved;
}

/** Reset to `process.cwd()` — only for test isolation */
export function resetProjectRoot(): void {
  projectRoot = process.cwd();
}
