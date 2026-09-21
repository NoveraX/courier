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
 * the registry on startup from `courier.config.ts.sources`. The same
 * function installs a `studioHooks.onSourceDefined` listener so that
 * hot-reloaded `defineApi()` calls land here too without user-code
 * intervention.
 *
 * # Storage
 *
 * Pinned to `globalThis` via `Symbol.for` so it survives bundler module
 * duplication (Turbopack / webpack chunk boundaries) — the same pattern
 * as `studioHooks` and `app-origin`.
 */

import { setSourceName } from "./define/api";
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
  return typeof value;
}

/**
 * Replace the current sources and notify every listener.
 *
 * Stamps each source's registry key onto the source object via
 * `setSourceName` so `createCaller(api)` emits the same source name
 * as the registry. Call this exactly once per process unless you
 * intend to replace the whole dictionary (HMR does this).
 */
export function registerSources(sources: Sources): void {
  /* The registry is process-global and read much later, by adapters, at
     request time. Accepting a wrong value here reports the mistake as a
     missing endpoint somewhere else entirely — or, for null, as a bare
     TypeError thrown from inside the library. */
  if (sources === null || typeof sources !== "object" || Array.isArray(sources)) {
    throw new ConfigurationError(
      "SOURCES_NOT_A_RECORD",
      [
        `[courier] registerSources() expects an object of named sources, received ${describe(sources)}.`,
        "",
        "Each key is the name the proxy addresses the source by:",
        "  registerSources({ api, billing })",
      ].join("\n"),
    );
  }

  for (const [key, src] of Object.entries(sources)) {
    setSourceName(src, key);
  }

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
