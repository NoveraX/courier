/**
 * Config-driven mock-server registry.
 *
 * Mock definitions live inline in `nexus.config.ts.mocks` as imported values.
 * The registry diffs the previous config snapshot against a fresh one and
 * emits add / change / remove events that the lifecycle coordinator consumes
 * to start, stop, or restart the corresponding child processes.
 *
 * Mock definition values are typed as `unknown` here because the canonical
 * `MockServerDefinition` type lives in `@noverax/nexus-mock` and pulling it
 * through `@noverax/nexus-studio` would invert the package dependency
 * direction (studio depends on mock, never the reverse). Callers narrow at
 * the consumption site.
 */

import type { NexusConfig } from "@noverax/nexus/config";

/** Stable identity + raw definition for one mock declared in `nexus.config.ts.mocks` */
export interface MockEntry {
  key: string;
  /** Reference to the value the user passed in `nexus.config.ts.mocks[key]` */
  definition: unknown;
}

export interface MockRegistryEvents {
  onAdded: (entry: MockEntry) => void;
  onChanged: (entry: MockEntry) => void;
  onRemoved: (key: string) => void;
}

export interface MockRegistry {
  /** Apply a freshly loaded config — diffs against the previous snapshot. */
  syncFromConfig(config: NexusConfig): void;
  /** Read the current snapshot — used by tests and the UI initial state. */
  getEntries(): MockEntry[];
  /**
   * Attach a listener that receives diff events from subsequent
   * `syncFromConfig` calls. Currently registered entries are replayed via
   * `onAdded` so a late-attaching consumer never misses them.
   */
  attach(events: MockRegistryEvents): void;
}

/**
 * Build a registry that emits add/change/remove deltas as configs flow in.
 *
 * The registry is empty until the first `syncFromConfig` call so the caller
 * controls when discovery begins (typically right after the initial
 * `loadNexusConfig` succeeds).
 */
export function createMockRegistry(initialEvents?: MockRegistryEvents): MockRegistry {
  const current = new Map<string, MockEntry>();
  const listeners: MockRegistryEvents[] = [];
  if (initialEvents) listeners.push(initialEvents);

  const fire = (kind: keyof MockRegistryEvents, payload: MockEntry | string): void => {
    for (const l of listeners) {
      if (kind === "onRemoved") l.onRemoved(payload as string);
      else if (kind === "onAdded") l.onAdded(payload as MockEntry);
      else l.onChanged(payload as MockEntry);
    }
  };

  return {
    syncFromConfig(config: NexusConfig): void {
      const next = extractMocks(config);
      const seen = new Set<string>();

      for (const entry of next) {
        seen.add(entry.key);
        const existing = current.get(entry.key);
        if (!existing) {
          current.set(entry.key, entry);
          fire("onAdded", entry);
          continue;
        }
        if (existing.definition !== entry.definition) {
          current.set(entry.key, entry);
          fire("onChanged", entry);
        }
      }

      for (const key of [...current.keys()]) {
        if (!seen.has(key)) {
          current.delete(key);
          fire("onRemoved", key);
        }
      }
    },
    getEntries(): MockEntry[] {
      return [...current.values()];
    },
    attach(events: MockRegistryEvents): void {
      listeners.push(events);
      for (const entry of current.values()) events.onAdded(entry);
    },
  };
}

function extractMocks(config: NexusConfig): MockEntry[] {
  const mocks = config.mocks;
  if (!mocks || typeof mocks !== "object") return [];
  const out: MockEntry[] = [];
  for (const [key, definition] of Object.entries(mocks)) {
    if (definition === undefined || definition === null) continue;
    out.push({ key, definition });
  }
  return out;
}
