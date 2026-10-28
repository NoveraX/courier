import { isAbsolute, resolve } from "node:path";

import { evaluateInChild } from "./evaluate-in-child";
import { fingerprintOf, UNSETTLED } from "./fingerprint";
import { createReadings } from "./routes-readings";
import type { RoutesRequest, RoutesSnapshot } from "./routes-snapshot";

/** Where a project is, for the engine that reads its routes. */
export interface RoutesEngineOptions {
  /** The project's root: the config is looked for there and in the folders above it. */
  root: string;
  /** The config file, absolute or from the root, when it is not the one found from the root. */
  config?: string | undefined;
  /**
   * The env files read before the config, absolute or from the root, the
   * first to set a variable winning; a variable the process was started with
   * wins over all. None by default.
   */
  envFiles?: readonly string[] | undefined;
  /**
   * The variables those files give, as the bundler reads them, asked anew
   * for every reading: the config then sees the values the app does, `${VAR}`
   * expanded as the bundler expands it. Without it the files are read as
   * they are.
   */
  envValues?: (() => Readonly<Record<string, string>>) | undefined;
}

/** Reads a project's routes, again only when what they depend on changed. */
export interface RoutesEngine {
  /**
   * The routes as the config gives them now. Read in a process of its own
   * the first time, and again only once a path the last reading depended
   * on, or a variable it looked at, has changed. Calls made while a reading
   * runs share it, unless something it read changed meanwhile: a call made
   * after it began then waits for the next reading, which begins after the
   * change. A failure is not kept: the next call reads again.
   *
   * @throws RoutesReadError when the config cannot be found or read
   */
  read(): Promise<RoutesSnapshot>;
  /** The routes the last successful reading gave, if one has. */
  readonly last: RoutesSnapshot | undefined;
  /**
   * A digest of what the latest successful reading depended on, as it is
   * now: equal digests mean the same routes. `undefined` before the first,
   * and while that reading may have missed a change made as it ran, until
   * `read()` reads again.
   */
  fingerprint(): string | undefined;
}

/** How a reading of the routes runs: in a process of its own, unless a test says otherwise. */
export type RoutesEvaluator = (request: RoutesRequest) => Promise<RoutesSnapshot>;

/**
 * Create the engine that reads a project's routes for a bundler plugin.
 *
 * @param options - Where the project and its config are
 * @param evaluate - How one reading runs: in a process of its own
 * @returns The engine
 * @example
 * ```ts
 * const engine = createRoutesEngine({ root: process.cwd(), envFiles: [".env.local", ".env"] });
 * const { routes } = await engine.read();
 * ```
 */
export function createRoutesEngine(
  options: RoutesEngineOptions,
  evaluate: RoutesEvaluator = evaluateInChild,
): RoutesEngine {
  const request = requestOf(options);
  const readings = createReadings(() => evaluate({ ...request, env: options.envValues?.() }));
  return {
    async read() {
      const outcome = await readings.next();
      if (outcome.ok) return outcome.snapshot;
      throw outcome.error;
    },
    get last() {
      return readings.kept?.snapshot;
    },
    fingerprint() {
      const kept = readings.kept;
      return kept === undefined || kept.fingerprint === UNSETTLED
        ? undefined
        : fingerprintOf(kept.snapshot);
    },
  };
}

function requestOf(options: RoutesEngineOptions): RoutesRequest {
  const root = resolve(options.root);
  const fromRoot = (path: string): string => (isAbsolute(path) ? path : resolve(root, path));
  return {
    root,
    configFile: options.config === undefined ? undefined : fromRoot(options.config),
    envFiles: (options.envFiles ?? []).map(fromRoot),
  };
}
