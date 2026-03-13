/**
 * Global mutable sources registry — survives bundler module duplication
 * via Symbol.for + globalThis (same pattern as devtoolsHooks in core).
 *
 * When HMR re-evaluates API modules, callers update the registry
 * and all listeners (e.g. Socket.IO emitter) are notified.
 */

import type { Sources } from "@noverax/nexus/define";

const SOURCES_KEY = Symbol.for("nexus.devtools.sources");

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

/** Replace current sources and notify all listeners */
export function registerSources(sources: Sources): void {
  const registry = getRegistry();
  registry.current = sources;
  registry.generation++;
  for (const fn of registry.listeners) fn(sources);
}

/** Get currently registered sources (may be undefined before first registration) */
export function getSources(): Sources | undefined {
  return getRegistry().current;
}

/** Subscribe to source changes. Returns unsubscribe function. */
export function onSourcesChange(fn: SourcesListener): () => void {
  const registry = getRegistry();
  registry.listeners.add(fn);
  return () => registry.listeners.delete(fn);
}

/** Current generation counter (cheap dirty-check for polling) */
export function getSourcesGeneration(): number {
  return getRegistry().generation;
}
