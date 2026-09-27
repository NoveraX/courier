import { existsSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Where to watch for an absent path to appear: the path itself when its
 * directory exists, else the first directory missing on the way to it.
 *
 * Nothing inside a directory can be watched before it exists, and creating
 * it comes first; the load that follows looks again and names the paths
 * inside it.
 *
 * @param path - An absolute path
 * @returns The path, or its first missing ancestor; `null` when it exists
 *
 * @example
 * ```ts
 * firstMissingPath("/app/src/late.ts"); // src exists → "/app/src/late.ts"
 * firstMissingPath("/app/generated/client/api.ts"); // no generated/ → "/app/generated"
 * ```
 */
export function firstMissingPath(path: string): string | null {
  if (existsSync(path)) return null;
  const parent = dirname(path);
  if (parent === path) return null;
  return existsSync(parent) ? path : firstMissingPath(parent);
}
