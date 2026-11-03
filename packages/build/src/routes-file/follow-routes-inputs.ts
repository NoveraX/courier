import { type FSWatcher, watch } from "node:fs";
import { dirname, join, sep } from "node:path";

import type { RoutesInputs } from "../engine/routes-snapshot";
import type { RoutesFile } from "./routes-file";

/**
 * Watch what a reading of the routes read, so a change to any of it reads
 * them again and rewrites the module, which the bundler then builds anew:
 * the folder of each file — an edit saved by replacing the file, as editors
 * save, is seen there, where a watcher on the file itself loses it — and
 * each folder whose entries the reading listed. Packages under
 * `node_modules` are not watched: the bundler is restarted when they
 * change. The watchers hold no process open, and a folder watched already
 * gets no second one.
 *
 * @param routes - The project's routes
 * @param inputs - What the reading read, whether it gave routes or failed
 * @param onChange - Called on each change to any of it
 * @returns Whether a folder is watched now that was not before
 * @example
 * ```ts
 * followRoutesInputs(routes, snapshot, () => refreshSoon(routes));
 * ```
 */
export function followRoutesInputs(
  routes: RoutesFile,
  inputs: RoutesInputs,
  onChange: () => void,
): boolean {
  const listed = new Set(inputs.listed ?? []);
  let added = false;
  for (const path of [...inputs.files, ...listed]) {
    if (path === routes.file || isPackaged(path)) continue;
    routes.inputs.add(path);
    added = watchFolder(routes, listed.has(path) ? path : dirname(path), onChange) || added;
  }
  return added;
}

function watchFolder(routes: RoutesFile, folder: string, onChange: () => void): boolean {
  if (routes.watchers.has(folder)) return false;
  let watcher: FSWatcher;
  try {
    watcher = watch(folder, { persistent: false }, (_event, name) => {
      const path = name === null ? folder : join(folder, name);
      if (routes.inputs.has(path) || routes.inputs.has(folder)) onChange();
    });
  } catch {
    /* A folder that is not there holds nothing the reading read. */
    return false;
  }
  watcher.on("error", () => {
    watcher.close();
    routes.watchers.delete(folder);
  });
  routes.watchers.set(folder, watcher);
  return true;
}

function isPackaged(path: string): boolean {
  return path.includes(`${sep}node_modules${sep}`);
}
