import { statSync } from "node:fs";
import { sep } from "node:path";

import type { RoutesInputs } from "../engine/routes-snapshot";
import type { RoutesPluginState } from "./routes-plugin-state";

/** What of Vite's plugin context watches a file for the module it loads. */
export interface WatchContext {
  addWatchFile(file: string): void;
}

/**
 * Follow what a reading of the routes read, so that a change to it loads
 * the routes module again. Each file is watched for the module, and Vite
 * loads it again once one changes; every path, there or not, a folder too,
 * is followed by each dev server's watcher, which loads it again once one
 * appears or goes, or a folder's entries change. Installed packages are
 * left to the install.
 *
 * @param context - Vite's plugin context, loading the routes module
 * @param state - What the plugin knows, whose followed paths this replaces
 * @param inputs - What the reading read, whether it gave routes or failed
 * @example
 * ```ts
 * followRoutesInputs(this, state, snapshot);
 * ```
 */
export function followRoutesInputs(
  context: WatchContext,
  state: RoutesPluginState,
  inputs: RoutesInputs,
): void {
  const followed = new Set<string>();
  for (const path of inputs.files) {
    if (path.split(sep).includes("node_modules")) continue;
    followed.add(path);
    /* Vite takes a watched file for an import of the module: only a file that is there. */
    if (isFile(path)) context.addWatchFile(path);
  }
  state.followed = followed;
  for (const server of state.servers) server.watcher.add([...followed]);
}

/* A path it may not look at is no file it can watch; the watcher follows it all the same. */
function isFile(path: string): boolean {
  try {
    return statSync(path, { throwIfNoEntry: false })?.isFile() === true;
  } catch {
    return false;
  }
}
