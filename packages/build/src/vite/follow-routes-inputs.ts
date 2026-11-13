import { type Stats, statSync } from "node:fs";
import { sep } from "node:path";

import type { RoutesInputs } from "../engine/routes-snapshot";
import { realFile, realFolder } from "../util/real-path";
import type { RoutesPluginState } from "./routes-plugin-state";
import { watchOnce } from "./watch-once";

/** What of Vite's plugin context watches a file for the module it loads. */
export interface WatchContext {
  addWatchFile(file: string): void;
}

/**
 * Follow what a reading of the routes read, so that a change to it loads
 * the routes module again. Each file is watched for the module, and Vite
 * loads it again once one changes; every path, there or not, is followed by
 * each dev server's watcher, which loads it again once one appears or goes,
 * and so is every entry of a folder the reading listed. Installed packages
 * are left to the install.
 *
 * A file followed only now was not watched while it was read: a change
 * saved to it as the reading ran told no one, and is told by the answer.
 * The plugin knows each path by its real name, as a watcher of the project
 * opened through a link reports it under another.
 *
 * @param context - Vite's plugin context, loading the routes module
 * @param state - What the plugin knows, whose followed paths this replaces
 * @param inputs - What the reading read, whether it gave routes or failed
 * @param since - When the reading began, in milliseconds since the epoch, for one that gave routes
 * @returns Whether a file followed only now changed after `since`: the routes are then read again
 * @example
 * ```ts
 * followRoutesInputs(this, state, snapshot);
 * ```
 */
export function followRoutesInputs(
  context: WatchContext,
  state: RoutesPluginState,
  inputs: RoutesInputs,
  since?: number,
): boolean {
  const files = inputs.files.filter((path) => !isInstalled(path));
  const folders = (inputs.listed ?? []).filter((folder) => !isInstalled(folder));
  const followed = new Set<string>();
  let missed = false;
  for (const path of files) {
    const real = realFile(path);
    followed.add(real);
    const stats = statOf(path);
    /* Vite takes a watched file for an import of the module: only a file that is there. */
    if (stats?.isFile() !== true) continue;
    context.addWatchFile(path);
    if (since !== undefined && !state.followed.has(real) && stats.mtimeMs >= since) missed = true;
  }
  state.followed = followed;
  state.listed = new Set(folders.map(realFolder));
  for (const server of state.servers) watchOnce(server, [...files, ...folders]);
  return missed;
}

function isInstalled(path: string): boolean {
  return path.split(sep).includes("node_modules");
}

/* A path it may not look at is no file it can watch; the watcher follows it all the same. */
function statOf(path: string): Stats | undefined {
  try {
    return statSync(path, { throwIfNoEntry: false });
  } catch {
    return undefined;
  }
}
