import type { PresenceAdapter, PresenceDiff, PresenceEntry } from "./adapters";
import { sweepStaleEntries } from "./presence-sweep";
import type { PresenceConfig } from "./presence-types";

const DEFAULT_SWEEP_INTERVAL_MS = 30_000;
const DEFAULT_STALE_THRESHOLD_MS = 45_000;

type DiffHandler = (diff: PresenceDiff) => void;

/**
 * In-process presence adapter for single-server or testing.
 * Tracks connections per topic with automatic stale-entry sweep.
 *
 * @example
 * ```ts
 * const presence = createMemoryPresence();
 * await presence.connect();
 *
 * await presence.track("room:1", {
 *   userId: "alice",
 *   connectionId: "conn_1",
 *   metadata: { status: "online" },
 * });
 *
 * const entries = await presence.list("room:1");
 * ```
 */
export function createMemoryPresence(config?: PresenceConfig): PresenceAdapter {
  const sweepIntervalMs = config?.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS;
  const staleThresholdMs = config?.staleThresholdMs ?? DEFAULT_STALE_THRESHOLD_MS;

  const topics = new Map<string, Map<string, PresenceEntry>>();
  const diffHandlers = new Map<string, Set<DiffHandler>>();
  const errorHandlers = new Set<(error: Error) => void>();
  let connected = false;
  let sweepTimer: ReturnType<typeof setInterval> | undefined;

  function emitError(error: Error): void {
    for (const handler of errorHandlers) {
      handler(error);
    }
  }

  function emitDiff(topic: string, diff: PresenceDiff): void {
    const handlers = diffHandlers.get(topic);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        handler(diff);
      } catch (err) {
        emitError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  function getOrCreateTopic(topic: string): Map<string, PresenceEntry> {
    let entries = topics.get(topic);
    if (!entries) {
      entries = new Map();
      topics.set(topic, entries);
    }
    return entries;
  }

  function sweepTopic(
    topic: string,
    entries: Map<string, PresenceEntry>,
    thresholdMs: number,
  ): void {
    const swept = sweepStaleEntries(entries, thresholdMs);
    if (entries.size === 0) topics.delete(topic);
    if (swept.length > 0) {
      emitDiff(topic, { joins: [], leaves: swept });
    }
  }

  function sweepAll(): void {
    for (const [topic, entries] of topics) {
      sweepTopic(topic, entries, staleThresholdMs);
    }
  }

  function startSweepTimer(): void {
    if (sweepIntervalMs > 0) {
      sweepTimer = setInterval(sweepAll, sweepIntervalMs);
      if (typeof sweepTimer === "object" && "unref" in sweepTimer) {
        sweepTimer.unref();
      }
    }
  }

  return {
    async connect() {
      connected = true;
      startSweepTimer();
    },

    async disconnect() {
      connected = false;
      if (sweepTimer !== undefined) {
        clearInterval(sweepTimer);
        sweepTimer = undefined;
      }
      topics.clear();
      diffHandlers.clear();
      errorHandlers.clear();
    },

    isHealthy: () => connected,

    onError(handler) {
      errorHandlers.add(handler);
      return () => {
        errorHandlers.delete(handler);
      };
    },

    async track(topic, entry) {
      if (!connected) return;
      const now = Date.now();
      const full: PresenceEntry = { ...entry, joinedAt: now, lastSeenAt: now };
      getOrCreateTopic(topic).set(entry.connectionId, full);
      emitDiff(topic, { joins: [full], leaves: [] });
    },

    async update(topic, connectionId, metadata) {
      if (!connected) return;
      const entries = topics.get(topic);
      if (!entries) return;
      const existing = entries.get(connectionId);
      if (!existing) return;
      entries.set(connectionId, { ...existing, metadata, lastSeenAt: Date.now() });
    },

    async untrack(topic, connectionId) {
      if (!connected) return;
      const entries = topics.get(topic);
      if (!entries) return;
      const existing = entries.get(connectionId);
      if (!existing) return;
      entries.delete(connectionId);
      if (entries.size === 0) topics.delete(topic);
      emitDiff(topic, { joins: [], leaves: [existing] });
    },

    async list(topic) {
      const entries = topics.get(topic);
      return entries ? [...entries.values()] : [];
    },

    async heartbeat(topic, connectionId) {
      if (!connected) return;
      const entries = topics.get(topic);
      if (!entries) return;
      const existing = entries.get(connectionId);
      if (!existing) return;
      entries.set(connectionId, { ...existing, lastSeenAt: Date.now() });
    },

    async sweep(topic, thresholdMs) {
      const entries = topics.get(topic);
      if (!entries) return [];
      const swept = sweepStaleEntries(entries, thresholdMs);
      if (entries.size === 0) topics.delete(topic);
      if (swept.length > 0) emitDiff(topic, { joins: [], leaves: swept });
      return swept;
    },

    onDiff(topic, handler) {
      let set = diffHandlers.get(topic);
      if (!set) {
        set = new Set();
        diffHandlers.set(topic, set);
      }
      set.add(handler);
      const captured = set;
      return () => {
        captured.delete(handler);
        if (captured.size === 0) diffHandlers.delete(topic);
      };
    },
  };
}
