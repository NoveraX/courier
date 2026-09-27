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

import { resolve } from "node:path";

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

/** Reset to `process.cwd()` — only for test isolation */
export function resetProjectRoot(): void {
  projectRoot = process.cwd();
}
