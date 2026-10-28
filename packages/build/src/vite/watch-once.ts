import type { ViteDevServer } from "vite";

/* The paths each dev server's watcher was given already: chokidar watches a path given
   again over again, with one more listener each time. */
const given = new WeakMap<ViteDevServer, Set<string>>();

/**
 * Hand a dev server's watcher the paths it was not given yet. The routes
 * module is loaded again on every edit, and follows the same paths each
 * time: each is given to each server once.
 *
 * @param server - The dev server
 * @param paths - The paths to watch, there or not
 * @example
 * ```ts
 * watchOnce(server, ["/app/courier.config.ts", "/app/.env.local"]);
 * ```
 */
export function watchOnce(server: ViteDevServer, paths: Iterable<string>): void {
  let seen = given.get(server);
  if (seen === undefined) {
    seen = new Set();
    given.set(server, seen);
  }
  const fresh = [...paths].filter((path) => !seen.has(path));
  for (const path of fresh) seen.add(path);
  if (fresh.length > 0) server.watcher.add(fresh);
}
