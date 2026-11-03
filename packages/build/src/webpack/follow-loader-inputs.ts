import { statSync } from "node:fs";

import type { RoutesInputs } from "../engine/routes-snapshot";
import type { RoutesLoaderContext } from "./routes-loader-context";

/**
 * Hand the bundler what a reading of the routes read, so that a change to
 * any of it builds the routes module again: each file there, each path that
 * is not there yet, should one appear, and each folder whose entries the
 * reading listed. A bundler that has no way to follow a missing path or a
 * folder's entries is told the rest.
 *
 * @param context - The loader's context
 * @param inputs - What the reading read, whether it gave routes or failed
 * @example
 * ```ts
 * followLoaderInputs(this, snapshot);
 * ```
 */
export function followLoaderInputs(context: RoutesLoaderContext, inputs: RoutesInputs): void {
  for (const path of inputs.files) {
    if (isThere(path)) context.addDependency(path);
    else context.addMissingDependency?.(path);
  }
  for (const folder of inputs.listed ?? []) context.addContextDependency?.(folder);
}

/* A path it may not look at counts as there: the bundler watches it all the same. */
function isThere(path: string): boolean {
  try {
    return statSync(path, { throwIfNoEntry: false }) !== undefined;
  } catch {
    return true;
  }
}
