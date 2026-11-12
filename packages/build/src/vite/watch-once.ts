import { basename, dirname } from "node:path";
import type { ViteDevServer } from "vite";

import { localPath } from "../util/local-path";

/* The paths each dev server's watcher was given already, or followed already: chokidar
   watches a path given again over again, with one more listener each time. */
const given = new WeakMap<ViteDevServer, Set<string>>();

/**
 * Hand a dev server's watcher each path it does not follow yet. The routes
 * module is loaded again on every edit, and follows the same paths each
 * time: each is given to each server once. A path the watcher follows
 * already, as it follows Vite's root, is not given at all: chokidar reads a
 * folder it is handed as one just added, and an entry made since the routes
 * were read would pass for one that was there, with no notice of it. A
 * watcher that stops at a depth lists the folders below it unread: it is
 * handed every path.
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
  if (fresh.length === 0) return;
  /* Each folder the watcher follows, with its entries, named as `path.resolve` names it. */
  const watched = server.watcher.options.depth === undefined ? server.watcher.getWatched() : {};
  const unfollowed = fresh.filter((path) => {
    const local = localPath(path);
    return !watched[dirname(local)]?.includes(basename(local));
  });
  if (unfollowed.length > 0) server.watcher.add(unfollowed);
}
