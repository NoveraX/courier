import { realpathSync } from "node:fs";

const known = new Map<string, string>();
/* Paths are few — the files open, the files that declare endpoints — yet a long session meets many. */
const MOST_KNOWN = 2_000;

/**
 * A file's path with its links resolved, as Studio names the files it
 * reads — so a project opened through a link still finds its declarations.
 * A file not on disk keeps its own path.
 *
 * @param path - The path
 * @returns The path, links resolved
 * @example
 * ```ts
 * realPath("/var/folders/x/shop/src/cart.ts"); // "/private/var/folders/x/shop/src/cart.ts"
 * ```
 */
export function realPath(path: string): string {
  const cached = known.get(path);
  if (cached !== undefined) return cached;
  let resolved = path;
  try {
    resolved = realpathSync(path);
  } catch {
    /* Not saved yet, or gone: it is known by the path the editor gives it. */
  }
  if (known.size >= MOST_KNOWN) known.clear();
  known.set(path, resolved);
  return resolved;
}
