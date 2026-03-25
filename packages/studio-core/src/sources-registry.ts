/**
 * Global mutable sources registry — survives bundler module duplication
 * via Symbol.for + globalThis (same pattern as studioHooks in core).
 *
 * When HMR re-evaluates API modules, callers update the registry
 * and all listeners (e.g. Socket.IO emitter) are notified.
 */

import type { Sources } from "@noverax/nexus/define";

const SOURCES_KEY = Symbol.for("nexus.studio.sources");
const SOURCE_NAME_KEY = Symbol.for("nexus.source.name");

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

/** Replace current sources and notify all listeners.
 *  Syncs SOURCE_NAME_KEY on each source object to match its registry key,
 *  so that createCaller(api) emits the same source name as the registry. */
export function registerSources(sources: Sources): void {
  for (const [key, src] of Object.entries(sources)) {
    (src as Record<symbol, unknown>)[SOURCE_NAME_KEY] = key;
  }

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

/**
 * Rename source keys to canonical names (from server catalog).
 * Updates both registry keys and SOURCE_NAME_KEY on source objects,
 * so createCaller(source).getSourceName() returns the canonical name.
 *
 * Does NOT trigger listeners — this is a silent rename, not a structural change.
 */
export function renameSourceKeys(mapping: Record<string, string>): void {
  const registry = getRegistry();
  if (!registry.current) return;

  let changed = false;
  const renamed: Sources = {};

  for (const [key, src] of Object.entries(registry.current)) {
    const canonical = mapping[key];
    if (canonical && canonical !== key) {
      renamed[canonical] = src;
      (src as Record<symbol, unknown>)[SOURCE_NAME_KEY] = canonical;
      changed = true;
    } else {
      renamed[key] = src;
    }
  }

  if (changed) {
    registry.current = renamed;
    // Don't bump generation or notify — this is a rename, not a content change.
    // The catalog already has the correct structure.
  }
}
