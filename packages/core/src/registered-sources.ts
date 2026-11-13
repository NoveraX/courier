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
 * in production just to read a dictionary. Studio's runtime reads it too,
 * to name the API each event comes from — in a page as well, which takes
 * this module alone: what checks the sources and registers them is a
 * server's (`server/sources`).
 *
 * # Who writes to it
 *
 * `registerSources()`, once it has checked the sources and stamped their
 * keys. `attachRuntime()` from `@noverax/courier-studio-core/runtime` calls
 * it on startup with `courier.config.ts.sources`. Outside production it
 * also listens on `studioHooks.onSourceDefined`, and registers the config's
 * sources again whenever a hot-reloaded module runs `defineApi()`, so the
 * registry follows the application's edits without user-code intervention.
 *
 * # Storage
 *
 * Pinned to `globalThis` via `Symbol.for` so it survives bundler module
 * duplication (Turbopack / webpack chunk boundaries) — the same pattern
 * as `studioHooks` and `app-origin`.
 */

import type { Sources } from "./define/types";

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
 * Make `sources` the registered ones, and tell every listener: what
 * `registerSources` does once it has checked them and stamped their keys.
 *
 * @param sources - The sources by key, checked
 * @example
 * ```ts
 * prepareSources(sources, "registerSources", "registerSources({ api, billing })");
 * replaceSources(sources);
 * ```
 */
export function replaceSources(sources: Sources): void {
  const registry = getRegistry();
  registry.current = sources;
  registry.generation++;
  for (const fn of registry.listeners) fn(sources);
}

/**
 * Empty the registry, and drop its listeners: for the test harnesses
 * `_resetSourcesForTests` serves, never for an application.
 *
 * @example
 * ```ts
 * clearSources();
 * getSources(); // undefined
 * ```
 */
export function clearSources(): void {
  const registry = getRegistry();
  registry.current = undefined;
  registry.generation = 0;
  registry.listeners.clear();
}
