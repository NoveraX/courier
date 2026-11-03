import type { RoutesEngine } from "../engine/routes-engine";
import { routesModuleCode } from "../engine/routes-module-code";
import { RoutesReadError } from "../engine/routes-read-error";
import type { RoutesInputs } from "../engine/routes-snapshot";

/** What of Rollup's and Rolldown's plugin context the routes module is loaded with. */
export interface RoutesPluginContext {
  readonly meta: { readonly watchMode: boolean };
  addWatchFile(id: string): void;
  warn(message: string): void;
  error(message: string): never;
}

/**
 * The routes module: the routes read from the config, with every path they
 * came from watched — a file that is not there yet, and each folder whose
 * entries the reading listed, too — so a watching build builds it again
 * once one changes.
 *
 * When they cannot be read, what the failed reading read is watched instead,
 * so mending the config brings the routes back. A build fails with why;
 * under watch, the routes read last stay, with a warning, and with none
 * read yet the build fails.
 *
 * @param context - The plugin's context
 * @param engine - The engine that reads the project's routes
 * @returns The module's code
 * @example
 * ```ts
 * load(id) { return id === ROUTES_MODULE_ID ? loadRoutesModule(this, engine) : null; }
 * ```
 */
export async function loadRoutesModule(
  context: RoutesPluginContext,
  engine: RoutesEngine,
): Promise<string> {
  try {
    const snapshot = await engine.read();
    follow(context, snapshot);
    return routesModuleCode(snapshot);
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    const read = failure instanceof RoutesReadError ? failure.inputs : undefined;
    const followed = read ?? engine.last;
    if (followed !== undefined) follow(context, followed);
    const why = `[courier] ${failure.message}`;
    const last = engine.last;
    if (!context.meta.watchMode || last === undefined) return context.error(why);
    context.warn(why);
    return routesModuleCode(last);
  }
}

function follow(context: RoutesPluginContext, inputs: RoutesInputs): void {
  for (const path of [...inputs.files, ...(inputs.listed ?? [])]) context.addWatchFile(path);
}
