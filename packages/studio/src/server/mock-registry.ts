/**
 * Mock-server registry.
 *
 * Mock definitions are the default export of `courier.mocks.ts`, by key. The
 * registry diffs the previous snapshot against a freshly loaded one and emits
 * add / change / remove events that the lifecycle coordinator consumes to
 * start, stop, or restart the corresponding child processes.
 *
 * Mock definition values are typed as `unknown` here because the canonical
 * `MockServerDefinition` type lives in `@noverax/courier-mock` and pulling it
 * through `@noverax/courier-studio` would invert the package dependency
 * direction (studio depends on mock, never the reverse). Callers narrow at
 * the consumption site.
 */

/** Stable identity + raw definition for one mock declared in `courier.mocks.ts` */
export interface MockEntry {
  key: string;
  /** Reference to the value the user declared under `key` */
  definition: unknown;
  /** The fingerprint of its declaration and what that uses, when Studio could read one */
  fingerprint?: string;
}

export interface MockRegistryEvents {
  onAdded: (entry: MockEntry) => void;
  onChanged: (entry: MockEntry) => void;
  onRemoved: (key: string) => void;
}

export interface MockRegistry {
  /**
   * Apply freshly loaded mocks, by key — diffs against the previous snapshot.
   * A mock whose fingerprint is what it was is unchanged, though the load
   * made its definition anew; without fingerprints on both sides, any other
   * definition object is a change.
   */
  syncFromMocks(mocks: Record<string, unknown>, fingerprints?: ReadonlyMap<string, string>): void;
  /** Read the current snapshot — used by tests and the UI initial state. */
  getEntries(): MockEntry[];
  /**
   * Attach a listener that receives diff events from subsequent
   * `syncFromMocks` calls. Currently registered entries are replayed via
   * `onAdded` so a late-attaching consumer never misses them.
   *
   * @returns Detaches the listener; it hears nothing after that.
   */
  attach(events: MockRegistryEvents): () => void;
}

/**
 * Build a registry that emits add/change/remove deltas as loads flow in.
 *
 * The registry is empty until the first `syncFromMocks` call so the caller
 * controls when discovery begins (typically right after the initial
 * `loadCourierConfig` succeeds).
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
    syncFromMocks(
      mocks: Record<string, unknown>,
      fingerprints?: ReadonlyMap<string, string>,
    ): void {
      const next = declaredMocks(mocks, fingerprints);
      const seen = new Set<string>();

      for (const entry of next) {
        seen.add(entry.key);
        const existing = current.get(entry.key);
        if (!existing) {
          current.set(entry.key, entry);
          fire("onAdded", entry);
          continue;
        }
        current.set(entry.key, entry);
        if (changed(existing, entry)) fire("onChanged", entry);
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
    attach(events: MockRegistryEvents): () => void {
      listeners.push(events);
      for (const entry of current.values()) events.onAdded(entry);
      return () => {
        const index = listeners.indexOf(events);
        if (index !== -1) listeners.splice(index, 1);
      };
    },
  };
}

/* A key left `undefined` or `null` declares no mock, so one can be switched off in place. */
function declaredMocks(
  mocks: Record<string, unknown>,
  fingerprints: ReadonlyMap<string, string> | undefined,
): MockEntry[] {
  const out: MockEntry[] = [];
  for (const [key, definition] of Object.entries(mocks)) {
    if (definition === undefined || definition === null) continue;
    const fingerprint = fingerprints?.get(key);
    out.push(fingerprint === undefined ? { key, definition } : { key, definition, fingerprint });
  }
  return out;
}

function changed(before: MockEntry, after: MockEntry): boolean {
  if (before.fingerprint !== undefined && after.fingerprint !== undefined) {
    return before.fingerprint !== after.fingerprint;
  }
  return before.definition !== after.definition;
}
