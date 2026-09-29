/**
 * Global sources registry — the canonical in-process record of every
 * API source the runtime currently knows about.
 *
 * # Why this lives in core
 *
 * Framework adapter handlers (`courierHandler()`, `apiRoute()`, …) read
 * sources at request time via `getSources()` instead of taking an
 * explicit `sources` argument. Core ships with the registry so the
 * adapter packages don't need to depend on `@noverax/courier-studio-core`
 * in production just to read a dictionary.
 *
 * # Who writes to it
 *
 * `attachRuntime()` from `@noverax/courier-studio-core/runtime` populates
 * the registry on startup from `courier.config.ts.sources`. Outside
 * production it also listens on `studioHooks.onSourceDefined`, and registers
 * the config's sources again whenever a hot-reloaded module runs
 * `defineApi()`, so the registry follows the application's edits without
 * user-code intervention.
 *
 * # Storage
 *
 * Pinned to `globalThis` via `Symbol.for` so it survives bundler module
 * duplication (Turbopack / webpack chunk boundaries) — the same pattern
 * as `studioHooks` and `app-origin`.
 */

import { stampSourceKeys } from "./define/stamp-source-keys";
import type { Sources } from "./define/types";
import { ConfigurationError } from "./errors/configuration-error";

const SOURCES_KEY = Symbol.for("courier.sources");

type SourcesListener = (sources: Sources) => void;

interface SourcesRegistry {
  current: Sources | undefined;
  generation: number;
  listeners: Set<SourcesListener>;
}

const g = globalThis as Record<symbol, unknown>;

function getRegistry(): SourcesRegistry {
  if (!g[SOURCES_KEY]) {
    g[SOURCES_KEY] = { current: undefined, generation: 0, listeners: new Set() };
  }
  return g[SOURCES_KEY] as SourcesRegistry;
}

/** What the caller actually passed, for an error message that names it. */
function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  if (value instanceof Promise) return "a Promise — await it first";
  if (typeof value !== "object") return typeof value;
  const name: unknown = value.constructor?.name;
  return typeof name === "string" && name !== "" ? `an instance of ${name}` : "an object";
}

/* An object literal or a module namespace, from any realm: a Map, a Promise
   or a class instance would be read as a registry holding no sources. */
function isPlainRecord(value: unknown): value is Sources {
  if (value === null || typeof value !== "object") return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === null || Object.getPrototypeOf(proto) === null;
}

/**
 * Check that `sources` is a dictionary of named sources, and make each key
 * its source's name, before anything serves them.
 *
 * Stamps each source's key onto the source object via `stampSourceKeys` so
 * `createCaller(api)` emits the same source name the server resolves, and
 * refuses a key that contradicts a name the author gave `defineApi`.
 *
 * @param sources - The sources by key, as the caller handed them over
 * @param callee - The function they were handed to, named in the error
 * @param usage - How that function takes them, shown in the error
 * @throws ConfigurationError `SOURCES_NOT_A_RECORD` for anything but an object
 * @throws ConfigurationError `SOURCE_KEY_MISMATCH` when a key contradicts a name
 *
 * @example
 * ```ts
 * prepareSources({ api, billing }, "registerSources", "registerSources({ api, billing })");
 * ```
 */
export function prepareSources(sources: Sources, callee: string, usage: string): void {
  /* Sources are read much later, at request time. Accepting a wrong value
     here reports the mistake as a missing endpoint somewhere else entirely —
     or, for null, as a bare TypeError thrown from inside the library. */
  if (!isPlainRecord(sources)) {
    throw new ConfigurationError(
      "SOURCES_NOT_A_RECORD",
      [
        `[courier] ${callee}() expects an object of named sources, received ${describe(sources)}.`,
        "",
        "Each key is the name the proxy addresses the source by:",
        `  ${usage}`,
      ].join("\n"),
    );
  }

  stampSourceKeys(sources);
}

/**
 * Replace the current sources and notify every listener.
 *
 * The sources are checked and their keys stamped first — see
 * `prepareSources`. Call this exactly once per process unless you intend
 * to replace the whole dictionary (HMR does this).
 */
export function registerSources(sources: Sources): void {
  prepareSources(sources, "registerSources", "registerSources({ api, billing })");

  const registry = getRegistry();
  registry.current = sources;
  registry.generation++;
  for (const fn of registry.listeners) fn(sources);
}

/**
 * Read the currently registered sources. Returns `undefined` before
 * the first `registerSources` call — adapter handlers must throw a
 * clear initialization error in that case rather than silently
 * dropping the request.
 */
export function getSources(): Sources | undefined {
  return getRegistry().current;
}

/** Subscribe to source changes. Returns unsubscribe function. */
export function onSourcesChange(fn: SourcesListener): () => void {
  const registry = getRegistry();
  registry.listeners.add(fn);
  return () => registry.listeners.delete(fn);
}

/** Monotonic generation counter for cheap dirty-checks. */
export function getSourcesGeneration(): number {
  return getRegistry().generation;
}

/**
 * Reset the global registry to its uninitialized state. Only used by test
 * harnesses to isolate `getSources()`/`requireSources()` semantics between
 * test cases — production code should never need to clear the registry.
 */
export function _resetSourcesForTests(): void {
  const registry = getRegistry();
  registry.current = undefined;
  registry.generation = 0;
  registry.listeners.clear();
}
