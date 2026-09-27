import { createBroadcastEngine } from "./sse-broadcast";
import { executeSSEShutdown } from "./sse-shutdown";
import type { SSEBroadcastEvent, SSEConnectionInfo, SSEConnectionRegistry } from "./sse-types";

/** Internal entry stored per SSE connection */
export interface SSERegistryEntry {
  connectionId: string;
  connectedAt: number;
  meta: Record<string, unknown>;
  source: string;
  group: string | undefined;
  method: string;
  eventCount: number;
  totalBytes: number;
  lastEventAt: number;
  /** Abort the stream (triggers signal → finally block → cleanup) */
  abort: () => void;
  /**
   * Write an event from outside the stream's generator: refused rather than
   * queued for a client that has fallen behind, and numbered only by an id of
   * its own.
   */
  send: (event: SSEBroadcastEvent) => boolean;
  /** Write a notice from the server about the stream itself, already formatted. */
  notify: (frame: string) => boolean;
}

/** @internal Registry with mutation methods for handler integration */
export interface InternalSSERegistry extends SSEConnectionRegistry {
  add(entry: SSERegistryEntry): boolean;
  remove(connectionId: string): void;
  /** Update metrics after each event emit */
  recordEvent(connectionId: string, bytes: number): void;
  /** Tell every connection the server is going away, then abort after drainMs */
  shutdown(options?: { retryMs?: number; drainMs?: number }): Promise<void>;
  /** Shared AbortSignal that fires on shutdown */
  readonly shutdownSignal: AbortSignal;
}

function toInfo(entry: SSERegistryEntry): SSEConnectionInfo {
  return {
    connectionId: entry.connectionId,
    connectedAt: entry.connectedAt,
    meta: entry.meta,
    source: entry.source,
    group: entry.group,
    method: entry.method,
    eventCount: entry.eventCount,
    totalBytes: entry.totalBytes,
    lastEventAt: entry.lastEventAt,
  };
}

/**
 * Create an SSE connection registry that tracks active streams.
 * Supports server-initiated broadcast via `send`, `broadcastToEndpoint`,
 * `broadcastToMeta`, and `broadcastAll` methods.
 */
export function createSSEConnectionRegistry(): InternalSSERegistry {
  const entries = new Map<string, SSERegistryEntry>();
  const shutdownController = new AbortController();
  const broadcast = createBroadcastEngine(entries);
  let isShuttingDown = false;

  function* matchEndpoint(source: string, group?: string, method?: string) {
    for (const entry of entries.values()) {
      if (entry.source !== source) continue;
      if (group !== undefined && entry.group !== group) continue;
      if (method !== undefined && entry.method !== method) continue;
      yield entry;
    }
  }

  return {
    get count() {
      return entries.size;
    },
    get isShuttingDown() {
      return isShuttingDown;
    },
    get shutdownSignal() {
      return shutdownController.signal;
    },

    get(id) {
      const e = entries.get(id);
      return e ? toInfo(e) : undefined;
    },
    has(id) {
      return entries.has(id);
    },
    list() {
      return [...entries.values()].map(toInfo);
    },

    getByMeta(predicate) {
      const result: SSEConnectionInfo[] = [];
      for (const e of entries.values()) if (predicate(e.meta)) result.push(toInfo(e));
      return result;
    },

    getByEndpoint(source, group, method) {
      return [...matchEndpoint(source, group, method)].map(toInfo);
    },

    disconnect(id) {
      entries.get(id)?.abort();
    },
    disconnectAll() {
      for (const e of [...entries.values()]) e.abort();
    },

    send(id, event) {
      return entries.get(id)?.send(event) ?? false;
    },

    broadcastToEndpoint(source, event: SSEBroadcastEvent, group, method) {
      return broadcast.deliver(matchEndpoint(source, group, method), event);
    },

    broadcastToMeta(predicate, event) {
      const matching = function* () {
        for (const e of entries.values()) if (predicate(e.meta)) yield e;
      };
      return broadcast.deliver(matching(), event);
    },

    broadcastAll(event) {
      return broadcast.deliver(entries.values(), event);
    },

    add(entry) {
      if (isShuttingDown) {
        entry.abort();
        return false;
      }
      entries.set(entry.connectionId, entry);
      return true;
    },

    remove(id) {
      entries.delete(id);
    },

    recordEvent(id, bytes) {
      const entry = entries.get(id);
      if (!entry) return;
      entry.eventCount++;
      entry.totalBytes += bytes;
      entry.lastEventAt = Date.now();
    },

    async shutdown(options) {
      if (isShuttingDown) return;
      isShuttingDown = true;
      await executeSSEShutdown(entries, shutdownController, options);
    },
  };
}
