/**
 * Project root context — stores the absolute path to the user's project.
 *
 * All file operations in the server resolve relative paths against this root
 * instead of process.cwd(), so devtools works correctly regardless of
 * where the server process was started.
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

/**
 * Resolve a path relative to the project root with traversal protection.
 *
 * Use this instead of `resolveProject` when paths originate from user input
 * (HTTP request bodies, query params, etc.) to prevent directory traversal attacks.
 *
 * @throws Error if the resolved path escapes the project root
 */
export function resolveProjectSafe(...paths: string[]): string {
  const resolved = resolve(projectRoot, ...paths);
  if (resolved !== projectRoot && !resolved.startsWith(`${projectRoot}/`)) {
    throw new Error(`Path traversal detected: resolved path escapes project root`);
  }
  return resolved;
}
