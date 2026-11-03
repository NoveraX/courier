import type { OnLoadResult } from "esbuild";
import type { RoutesEngine } from "../engine/routes-engine";
import { routesModuleCode } from "../engine/routes-module-code";
import { RoutesReadError } from "../engine/routes-read-error";
import type { RoutesInputs } from "../engine/routes-snapshot";

/**
 * The routes module, as esbuild loads it: the routes read from the config,
 * with every path they came from watched, so a context that watches builds
 * them again when one changes — a file that is not there yet included, and
 * each folder whose entries the reading listed.
 *
 * When they cannot be read, what the failed reading read is watched instead,
 * so mending the config brings the routes back. A first build fails with
 * why; a later one keeps the routes read last, and warns.
 *
 * @param engine - The engine that reads the project's routes
 * @param again - Whether a build has run before in this context
 * @returns What esbuild loads
 * @example
 * ```ts
 * build.onLoad({ filter: ANY_PATH, namespace }, () => loadRoutes(engine, builds > 1));
 * ```
 */
export async function loadRoutes(engine: RoutesEngine, again: boolean): Promise<OnLoadResult> {
  try {
    const snapshot = await engine.read();
    return { contents: routesModuleCode(snapshot), loader: "js", ...watched(snapshot) };
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    const read = failure instanceof RoutesReadError ? failure.inputs : undefined;
    const followed = read ?? engine.last;
    const watch = followed === undefined ? {} : watched(followed);
    const why = [{ text: `[courier] ${failure.message}` }];
    const last = engine.last;
    if (!again || last === undefined) return { errors: why, ...watch };
    return { contents: routesModuleCode(last), loader: "js", warnings: why, ...watch };
  }
}

/* esbuild watches a path that is not there yet as it does one that is: it builds again once it appears. */
function watched(inputs: RoutesInputs): Pick<OnLoadResult, "watchFiles" | "watchDirs"> {
  return { watchFiles: [...inputs.files], watchDirs: [...(inputs.listed ?? [])] };
}
