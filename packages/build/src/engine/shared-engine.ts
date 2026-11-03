import { createRoutesEngine, type RoutesEngine, type RoutesEngineOptions } from "./routes-engine";

/* One engine per project and config in a process: a build that runs Vite once
   per environment, each with its own plugin, reads the routes once for all. */
const engines = new Map<string, RoutesEngine>();

/**
 * The engine for a project, made once per process for the same root, config
 * and env files, and shared by every plugin made for them.
 *
 * @param options - Where the project and its config are, and its env files
 * @returns The engine those options name
 * @example
 * ```ts
 * sharedEngine({ root: "/app", envFiles: ["/app/.env"] }) === sharedEngine({ root: "/app", envFiles: ["/app/.env"] }); // true
 * ```
 */
export function sharedEngine(options: RoutesEngineOptions): RoutesEngine {
  const key = JSON.stringify([options.root, options.config ?? null, options.envFiles ?? []]);
  let engine = engines.get(key);
  if (engine === undefined) {
    engine = createRoutesEngine(options);
    engines.set(key, engine);
  }
  return engine;
}
