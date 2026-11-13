import { routesModuleCode, unreadRoutesModuleCode } from "../engine/routes-module-code";
import { RoutesReadError } from "../engine/routes-read-error";
import { followRoutesInputs, type WatchContext } from "./follow-routes-inputs";
import type { RoutesPluginState } from "./routes-plugin-state";
import { reloadRoutes } from "./watch-routes-inputs";

/** What of Vite's plugin context the routes module is loaded with. */
export interface LoadContext extends WatchContext {
  error(error: Error): never;
}

/**
 * The routes module for a page: the routes read from the config, with every
 * project path they came from followed, so a change loads the module again,
 * one saved to a file as it was read for the first time too.
 *
 * When they cannot be read, what the failed reading read is followed
 * instead, so mending the config or a module it imports brings the routes
 * back, in a dev server and in a build that watches alike. A build then
 * fails with why. A dev server keeps the routes it read last, and reports
 * why in its terminal and on the page; with none read yet, the module fails
 * where it is imported, with the reason.
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
  if (engine === undefined) {
    const why = "The routes were asked for before Vite resolved its config";
    throw new RoutesReadError("ROUTES_NOT_READ", why, { root: process.cwd() });
  }
  const began = Date.now();
  try {
    const snapshot = await engine.read();
    if (followRoutesInputs(context, state, snapshot, began)) {
      for (const server of state.servers) reloadRoutes(server);
    }
    return routesModuleCode(snapshot);
  } catch (error) {
    const failure = asError(error);
    const read = failure instanceof RoutesReadError ? failure.inputs : undefined;
    const followed = read ?? engine.last;
    if (followed !== undefined) followRoutesInputs(context, state, followed);
    if (state.config?.command === "build") context.error(failure);
    report(state, failure);
    const last = engine.last;
    return last === undefined ? unreadRoutesModuleCode(failure.message) : routesModuleCode(last);
  }
}

/* Why the routes were not read, in the dev server's terminal and over the page of each server. */
function report(state: RoutesPluginState, error: Error): void {
  const message = `[courier] ${error.message}`;
  state.config?.logger.error(message, { timestamp: true, error });
  for (const server of state.servers) {
    server.ws.send({ type: "error", err: { message, stack: error.stack ?? "" } });
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
