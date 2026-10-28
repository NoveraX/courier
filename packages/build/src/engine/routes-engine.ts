import { isAbsolute, resolve } from "node:path";

import { evaluateInChild } from "./evaluate-in-child";
import { fingerprintOf, UNSETTLED } from "./fingerprint";
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
}

/** Reads a project's routes, again only when what they depend on changed. */
export interface RoutesEngine {
  /**
   * The routes as the config gives them now. Read in a process of its own
   * the first time, and again only once a file the last reading read, or a
   * variable it looked at, has changed; calls made while one reading runs
   * share it.
   *
   * @throws RoutesReadError when the config cannot be found or read
   */
  read(): Promise<RoutesSnapshot>;
  /** The routes the last successful reading gave, if one has. */
  readonly last: RoutesSnapshot | undefined;
  /**
   * A digest of what the last reading depended on, as it is now, or
   * `undefined` before the first: equal digests mean the same routes.
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
  let last: Kept | undefined;
  let pending: Promise<RoutesSnapshot> | undefined;
  const readAgain = async (): Promise<RoutesSnapshot> => {
    const since = Date.now();
    const snapshot = await evaluate(request);
    last = { snapshot, fingerprint: fingerprintOf(snapshot, since) };
    return snapshot;
  };
  return {
    read() {
      if (last !== undefined && isCurrent(last)) return Promise.resolve(last.snapshot);
      pending ??= readAgain().finally(() => {
        pending = undefined;
      });
      return pending;
    },
    get last() {
      return last?.snapshot;
    },
    fingerprint: () => (last === undefined ? undefined : fingerprintOf(last.snapshot)),
  };
}

/** A reading, and the digest of what it depended on as it was when the reading ended. */
interface Kept {
  snapshot: RoutesSnapshot;
  fingerprint: string;
}

/* Whether nothing a kept reading depended on has changed since. */
function isCurrent(kept: Kept): boolean {
  return kept.fingerprint !== UNSETTLED && fingerprintOf(kept.snapshot) === kept.fingerprint;
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
