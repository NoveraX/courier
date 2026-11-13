import type { FSWatcher } from "node:fs";

import type { RoutesEngine } from "../engine/routes-engine";
import { routesModuleCode, unreadRoutesModuleCode } from "../engine/routes-module-code";
import { RoutesReadError } from "../engine/routes-read-error";
import type { RoutesInputs } from "../engine/routes-snapshot";
import { sharedEngine } from "../engine/shared-engine";
import { configFileOf } from "../util/config-file-of";
import { followRoutesInputs } from "./follow-routes-inputs";
import { writeRoutesFile } from "./write-routes-file";

/** The routes of one project, written to a module a bundler takes from disk, and what keeps it current. */
export interface RoutesFile {
  readonly root: string;
  readonly config: string | undefined;
  /** The module the bundler takes in place of the one the package ships, absolute. */
  readonly file: string;
  /** How the plugin is told to write the module elsewhere, for an error that says so. */
  readonly elsewhere: string;
  readonly engine: RoutesEngine;
  /** The config a page's bundle must not take, by its real path. */
  configFile: string | undefined;
  /** Why the latest reading gave no routes, when it gave none: a build fails with it. */
  failure: Error | undefined;
  /** Each path the routes came from, and each folder they listed, outside `node_modules`. */
  readonly inputs: Set<string>;
  /** A watcher for each folder those are in. */
  readonly watchers: Map<string, FSWatcher>;
}

/* One state per module, kept on the process, however many times the bundler
   loads its config, and however many copies of this package it loads. */
const REGISTRY = Symbol.for("@noverax/courier-build/routes-file");

const holder = globalThis as Record<symbol, unknown>;

/* A change saved in several writes is read once they have landed. */
const SETTLE_MS = 30;

/* A watcher begins to see changes a moment after it is made, and a change saved in that
   moment would go unseen: the engine looks at what the routes came from once more, then. */
const STARTING_MS = [250, 2_000];

const settling = new WeakMap<RoutesFile, ReturnType<typeof setTimeout>>();

/**
 * The routes of a project written to a module, made once per process for
 * the same module and read again on every call: a config the bundler loads
 * again reads them anew, and adds no watcher a folder has already.
 *
 * @param root - The project's root
 * @param config - The config, from the root or absolute, when it is not the one found
 * @param file - The module the bundler takes, absolute
 * @param elsewhere - How the plugin is told to write it elsewhere, for the error
 * @returns The routes, read and written
 * @throws RoutesReadError `ROUTES_NOT_WRITTEN` when the module cannot be written
 * @example
 * ```ts
 * const routes = await routesFile("/app", undefined, "/app/node_modules/.cache/@noverax/courier/routes.js", "withCourier(config, { outDir })");
 * ```
 */
export async function routesFile(
  root: string,
  config: string | undefined,
  file: string,
  elsewhere: string,
): Promise<RoutesFile> {
  const registry = registryOf();
  let routes = registry.get(file);
  if (routes === undefined) {
    routes = {
      root,
      config,
      file,
      elsewhere,
      engine: sharedEngine({ root, config, envFiles: [] }),
      configFile: undefined,
      failure: undefined,
      inputs: new Set(),
      watchers: new Map(),
    };
    registry.set(file, routes);
  }
  await refreshRoutes(routes);
  return routes;
}

/**
 * Read the routes again and write the module when they changed. The
 * engine's readings end in the order they began, so the module is left as
 * the last one read it. When the routes cannot be read, those read last
 * stay, and why is kept, for a build to fail with, and told in the
 * bundler's terminal; with none read yet, the module fails where it is
 * imported, saying why. Routes forgotten while they were read are left
 * alone: their project may be gone.
 *
 * @param routes - The project's routes
 * @throws RoutesReadError `ROUTES_NOT_WRITTEN` when the module cannot be written
 * @example
 * ```ts
 * await refreshRoutes(routes);
 * ```
 */
export async function refreshRoutes(routes: RoutesFile): Promise<void> {
  const follow = (inputs: RoutesInputs): void => {
    if (!followRoutesInputs(routes, inputs, () => refreshSoon(routes))) return;
    for (const ms of STARTING_MS) setTimeout(() => refreshSoon(routes), ms).unref();
  };
  try {
    const snapshot = await routes.engine.read();
    if (forgotten(routes)) return;
    routes.failure = undefined;
    writeRoutesFile(routes.file, routesModuleCode(snapshot), routes.root, routes.elsewhere);
    follow(snapshot);
  } catch (error) {
    if (error instanceof RoutesReadError && error.code === "ROUTES_NOT_WRITTEN") throw error;
    if (forgotten(routes)) return;
    const failure = error instanceof Error ? error : new Error(String(error));
    routes.failure = failure;
    const read = failure instanceof RoutesReadError ? failure.inputs : undefined;
    const followed = read ?? routes.engine.last;
    if (followed !== undefined) follow(followed);
    if (routes.engine.last === undefined) {
      const code = unreadRoutesModuleCode(failure.message);
      writeRoutesFile(routes.file, code, routes.root, routes.elsewhere);
    }
    console.error(`[courier] ${failure.message}`);
  }
  routes.configFile = configFileOf(routes.root, routes.config);
}

/**
 * Stop watching for every module written, and forget them: for a test that
 * makes a project of its own each time.
 *
 * @example
 * ```ts
 * afterEach(() => forgetRoutesFiles());
 * ```
 */
export function forgetRoutesFiles(): void {
  const registry = registryOf();
  for (const routes of registry.values()) {
    clearTimeout(settling.get(routes));
    for (const watcher of routes.watchers.values()) watcher.close();
  }
  registry.clear();
}

/* Routes forgotten meanwhile are not read again: their project may be gone. */
function refreshSoon(routes: RoutesFile): void {
  clearTimeout(settling.get(routes));
  const timer = setTimeout(() => {
    settling.delete(routes);
    if (forgotten(routes)) return;
    refreshRoutes(routes).catch((error: unknown) => {
      console.error(`[courier] ${error instanceof Error ? error.message : String(error)}`);
    });
  }, SETTLE_MS);
  timer.unref();
  settling.set(routes, timer);
}

function forgotten(routes: RoutesFile): boolean {
  return registryOf().get(routes.file) !== routes;
}

function registryOf(): Map<string, RoutesFile> {
  holder[REGISTRY] ??= new Map<string, RoutesFile>();
  return holder[REGISTRY] as Map<string, RoutesFile>;
}
