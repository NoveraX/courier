import type { RoutesEngine } from "@noverax/courier-build";

/* One engine per project and config in each of Parcel's workers: an unchanged project is not read again. */
const engines = new Map<string, Promise<RoutesEngine>>();

/**
 * The engine that reads a project's routes, made once per process for the
 * same root and config.
 *
 * @param root - The project's root, where the config is found from
 * @param config - The config, from the root or absolute, when it is not the one found
 * @returns The engine
 * @example
 * ```ts
 * const engine = await routesEngineOf(process.cwd(), undefined);
 * ```
 */
export function routesEngineOf(root: string, config: string | undefined): Promise<RoutesEngine> {
  const key = JSON.stringify([root, config ?? null]);
  let engine = engines.get(key);
  if (engine === undefined) {
    engine = import("@noverax/courier-build").then(({ createRoutesEngine }) =>
      createRoutesEngine({ root, config, envFiles: [] }),
    );
    engines.set(key, engine);
  }
  return engine;
}
