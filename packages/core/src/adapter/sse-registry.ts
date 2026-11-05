import { readSelector, type Selection } from "./connection-selector";
import { createBroadcastEngine } from "./sse-broadcast";
import { executeSSEShutdown } from "./sse-shutdown";
import type { SSEBroadcastEvent, SSEConnectionInfo, SSEConnectionRegistry } from "./sse-types";
import { createMetaIndex } from "./ws-meta-index";
import type { ConnectionSelector } from "./ws-registry-types";

/** Internal entry stored per SSE connection */
export interface SSERegistryEntry {
  connectionId: string;
  connectedAt: number;
  /** Its metadata, a frozen copy once the registry holds it: what a selector compares */
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
  /** This replica's entries a selection names, each once */
  select(selection: Selection): SSERegistryEntry[];
}

function toInfo(entry: SSERegistryEntry): SSEConnectionInfo {
  return {
    connectionId: entry.connectionId,
    connectedAt: entry.connectedAt,
    meta: { ...entry.meta },
    source: entry.source,
    group: entry.group,
    method: entry.method,
    eventCount: entry.eventCount,
    totalBytes: entry.totalBytes,
    lastEventAt: entry.lastEventAt,
  };
}

function selectionOf(selector: ConnectionSelector): Selection {
  const selection = readSelector(selector);
  if (typeof selection === "string") throw new TypeError(selection);
  return selection;
}

const held = (entry: SSERegistryEntry | undefined): entry is SSERegistryEntry =>
  entry !== undefined;

/**
 * Create an SSE connection registry that tracks active streams.
 * Supports server-initiated broadcast via `send`, `broadcastToEndpoint`,
 * `broadcastToMeta`, and `broadcastAll` methods. A selector finds its
 * streams by id, or through an index of each stream's metadata, a copy
 * taken as it opened.
 */
export function createSSEConnectionRegistry(): InternalSSERegistry {
  const entries = new Map<string, SSERegistryEntry>();
  const metaIndex = createMetaIndex();
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

  const registry: InternalSSERegistry = {
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
    list(selector) {
      if (selector === undefined) return [...entries.values()].map(toInfo);
      return registry.select(selectionOf(selector)).map(toInfo);
    },
    select(selection) {
      const ids = "ids" in selection ? new Set(selection.ids) : metaIndex.select(selection.fields);
      return [...ids].map((id) => entries.get(id)).filter(held);
    },

    getByEndpoint(source, group, method) {
      return [...matchEndpoint(source, group, method)].map(toInfo);
    },

    async disconnect(selector) {
      for (const entry of registry.select(selectionOf(selector))) entry.abort();
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

    broadcastToMeta(fields, event) {
      return broadcast.deliver(registry.select(selectionOf({ meta: fields })), event);
    },

    broadcastAll(event) {
      return broadcast.deliver(entries.values(), event);
    },

    add(entry) {
      if (isShuttingDown) {
        entry.abort();
        return false;
      }
      const before = entries.get(entry.connectionId);
      if (before) metaIndex.remove(entry.connectionId, before.meta);
      entry.meta = Object.freeze({ ...entry.meta });
      entries.set(entry.connectionId, entry);
      metaIndex.add(entry.connectionId, entry.meta);
      return true;
    },

    remove(id) {
      const entry = entries.get(id);
      if (!entry) return;
      entries.delete(id);
      metaIndex.remove(id, entry.meta);
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
  return registry;
}
