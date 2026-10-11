import { realpathSync } from "node:fs";

/**
 * A path with its links resolved, as Studio reads the project's modules by
 * — or the path itself for a file gone since it was named.
 *
 * @param path - The path
 * @returns The path, links resolved
 * @example
 * ```ts
 * resolvedPath("/var/folders/x/shop/courier.config.ts"); // "/private/var/folders/x/shop/courier.config.ts"
 * ```
 */
export function resolvedPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    /* Gone since it loaded: nothing it declares is found, and the walk says so. */
    return path;
  }
}
