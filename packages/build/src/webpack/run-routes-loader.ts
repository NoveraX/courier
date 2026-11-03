import { routesModuleCode } from "../engine/routes-module-code";
import { RoutesReadError } from "../engine/routes-read-error";
import { sharedEngine } from "../engine/shared-engine";
import { configInPageMessage } from "../util/config-in-page-message";
import { followLoaderInputs } from "./follow-loader-inputs";
import type { RoutesLoaderContext } from "./routes-loader-context";
import { routesLoaderOptionsOf } from "./routes-loader-options";

/**
 * What the routes loader gives for the module it runs on: the routes read
 * from the project's config, as a page's bundle and a server's take them, in
 * place of the module `@noverax/courier/routes` ships; or, on the config
 * itself in a page's bundle, a refusal.
 *
 * Every file the routes came from is handed to the bundler, which builds the
 * module again when one changes. When the routes cannot be read, a build
 * fails with why; a dev server keeps the routes it read last and reports why
 * over the page, and with none read yet, the module fails with the reason.
 *
 * @param context - The loader's context
 * @returns The module's code
 * @throws RoutesReadError when the routes cannot be read in a build, or ever were
 * @throws Error on the config itself, in a page's bundle
 * @example
 * ```ts
 * const code = await runRoutesLoader(this);
 * ```
 */
export async function runRoutesLoader(context: RoutesLoaderContext): Promise<string> {
  const options = routesLoaderOptionsOf(context.getOptions());
  if (options.refuse === "config-in-page") {
    throw new Error(configInPageMessage(context.resourcePath));
  }
  const engine = sharedEngine({ root: options.root, config: options.config, envFiles: [] });
  try {
    const snapshot = await engine.read();
    followLoaderInputs(context, snapshot);
    return routesModuleCode(snapshot);
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    const read = failure instanceof RoutesReadError ? failure.inputs : undefined;
    const followed = read ?? engine.last;
    if (followed !== undefined) followLoaderInputs(context, followed);
    const last = engine.last;
    if (last === undefined || builds(context)) throw failure;
    const reported = new Error(`[courier] ${failure.message}`, { cause: failure });
    /* Over the page where the bundler shows a module's errors; in its terminal where it has no way to. */
    if (context.emitError) context.emitError(reported);
    else console.error(reported.message);
    return routesModuleCode(last);
  }
}

/* A build, not a dev server: what webpack's mode says, or what the process runs as under Turbopack. */
function builds(context: RoutesLoaderContext): boolean {
  return context.mode === undefined
    ? process.env.NODE_ENV === "production"
    : context.mode === "production";
}
