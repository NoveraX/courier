/**
 * Process-global registry of sources announced by adapters that have called
 * `announceHosting()` in this runtime. The playground responder reads this
 * registry to dispatch incoming `playground:execute` events to the right
 * `executeRequest` / `executeDirectSSE` / `executeDirectWSChannel` call.
 *
 * Pinned to globalThis so HMR module duplication does not split announcements
 * across two registries — symmetric to how the announce buffer in
 * `core/src/announce` is pinned.
 */

import type { AnySource, Sources } from "@noverax/nexus/define";
import { getSourceName } from "@noverax/nexus/define";
import { consumeAnnouncements } from "./announce-hosting";

const REGISTRY_KEY = Symbol.for("nexus.studio.runtime-source-registry");
const INSTALLED_KEY = Symbol.for("nexus.studio.runtime-source-registry-installed");

const g = globalThis as Record<symbol, unknown>;

if (!g[REGISTRY_KEY]) g[REGISTRY_KEY] = new Map<string, AnySource>();

const registry = g[REGISTRY_KEY] as Map<string, AnySource>;

/**
 * Install a one-shot listener that accumulates every past and future
 * announcement into the source registry. Idempotent — calling twice is a
 * no-op so multiple `attachRuntime` invocations in the same process do not
 * create duplicate listeners.
 */
export function installSourceRegistry(): void {
  if (g[INSTALLED_KEY]) return;
  g[INSTALLED_KEY] = true;
  consumeAnnouncements((entry) => {
    for (const source of entry.sources) {
      const name = getSourceName(source);
      if (name) registry.set(name, source);
    }
  });
}

/** Snapshot the current registry as a `Sources` map. */
export function getRegisteredSources(): Sources {
  const out: Record<string, AnySource> = {};
  for (const [name, source] of registry) out[name] = source;
  return out as Sources;
}

/** Look up a single source by name. */
export function getRegisteredSource(name: string): AnySource | undefined {
  return registry.get(name);
}

/** Reset for tests only. */
export function _resetSourceRegistryForTests(): void {
  registry.clear();
  g[INSTALLED_KEY] = false;
}
