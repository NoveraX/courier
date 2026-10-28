import { existsSync } from "node:fs";
import { sep } from "node:path";

import { routesModuleCode, unreadRoutesModuleCode } from "../engine/routes-module-code";
import { RoutesReadError } from "../engine/routes-read-error";
import type { RoutesPluginState } from "./routes-plugin-state";

/** What of Vite's plugin context the routes module is loaded with. */
export interface LoadContext {
  addWatchFile(file: string): void;
  error(error: Error): never;
}

/**
 * The routes module for a page: the routes read from the config, with every
 * project file they came from watched, so a change reloads the module.
 *
 * A build that cannot read them fails with why. A dev server keeps the
 * routes it read last, reports why in its terminal and on the page, and
 * watches the config, so fixing it brings the routes back; with none read
 * yet, the module fails where it is imported, with the reason.
 *
 * @param context - Vite's plugin context, which watches files and fails builds
 * @param state - What the plugin knows of the Vite it runs in
 * @returns The module's code
 * @example
 * ```ts
 * load(id) { return id === ROUTES_MODULE_ID ? loadRoutesModule(this, state) : undefined; }
 * ```
 */
export async function loadRoutesModule(
  context: LoadContext,
  state: RoutesPluginState,
): Promise<string> {
  const engine = state.engine;
  if (engine === undefined)
    throw new Error("The routes were asked for before Vite resolved its config");
  try {
    const snapshot = await engine.read();
    watch(context, snapshot.files);
    return routesModuleCode(snapshot);
  } catch (error) {
    const failure = asError(error);
    if (state.config?.command === "build") context.error(failure);
    report(state, failure);
    const last = engine.last;
    if (last !== undefined) {
      watch(context, last.files);
      return routesModuleCode(last);
    }
    watch(context, filesToMendWith(failure));
    return unreadRoutesModuleCode(failure.message);
  }
}

/* Every project file the routes came from, watched; installed packages are left to the
   install. Vite takes a watched file for an import of the module, and one that is not there
   would fail it: an env file made later restarts Vite, and the engine reads it then. */
function watch(context: LoadContext, files: readonly string[]): void {
  for (const file of files) {
    if (!file.split(sep).includes("node_modules") && existsSync(file)) context.addWatchFile(file);
  }
}

/* The config the error names, when there is one to mend; one made later is seen by `watchForConfig`. */
function filesToMendWith(error: Error): string[] {
  return error instanceof RoutesReadError && error.context.configFile !== undefined
    ? [error.context.configFile]
    : [];
}

/* Why the routes were not read, in the dev server's terminal and over the page. */
function report(state: RoutesPluginState, error: Error): void {
  const message = `[courier] ${error.message}`;
  state.config?.logger.error(message, { timestamp: true, error });
  state.server?.ws.send({ type: "error", err: { message, stack: error.stack ?? "" } });
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
