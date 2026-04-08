import type { WSMessage } from "../realtime/ws/ws-protocol";
import { encodeMessage } from "../realtime/ws/ws-protocol";
import type { ServerTopicManager } from "./ws-topics";

/**
 * Yield to the event loop between broadcast batches.
 * Prevents blocking on 1000+ subscribers.
 */
const BATCH_SIZE = 512;
const yieldTick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** Read-only connection info exposed via public API */
export interface ConnectionInfo {
  readonly connectionId: string;
  readonly meta: Record<string, unknown>;
  readonly connectedAt: number;
  readonly topicCount: number;
}

/** Public API for managing active WebSocket connections */
export interface ConnectionRegistry {
  /** Number of active connections */
  readonly count: number;
  /** Get connection info by ID */
  get(connectionId: string): ConnectionInfo | undefined;
  /** Check if a connection exists */
  has(connectionId: string): boolean;
  /** List all active connections */
  list(): ConnectionInfo[];
  /** Filter connections by metadata predicate */
  getByMeta(predicate: (meta: Record<string, unknown>) => boolean): ConnectionInfo[];
  /** Send a data message to a specific connection */
  send(connectionId: string, data: unknown): void;
  /** Broadcast a data message to all connections (optionally exclude one). Yields to event loop for large audiences. */
  broadcast(data: unknown, exclude?: string): Promise<void>;
  /** Broadcast to all connections subscribed to a topic. Yields to event loop for large audiences. */
  broadcastToTopic(topic: string, data: unknown, exclude?: string): Promise<void>;
  /** Broadcast to all qualified topics matching a base topic (e.g. "api.chat.room" matches "api.chat.room#abc"). Yields to event loop for large audiences. */
  broadcastToBaseTopic(baseTopic: string, data: unknown, exclude?: string): Promise<void>;
  /** Send a data message to a specific connection with topic context */
  sendToConnection(connectionId: string, topic: string, data: unknown): void;
  /** Force-disconnect a connection */
  disconnect(connectionId: string, code?: number, reason?: string): void;
  /** Disconnect all connections matching a metadata predicate (e.g. ban a user) */
  disconnectByMeta(
    predicate: (meta: Record<string, unknown>) => boolean,
    code?: number,
    reason?: string,
  ): void;
}

/** Internal entry stored per connection */
export interface RegistryEntry {
  connectionId: string;
  meta: Record<string, unknown>;
  connectedAt: number;
  sendRaw: (msg: WSMessage) => void;
  /** Send pre-encoded JSON string — avoids redundant JSON.stringify on broadcast */
  sendEncoded: (encoded: string) => void;
  close: (code?: number, reason?: string) => void;
}

/** @internal Registry with add/remove methods for handler integration */
export interface InternalConnectionRegistry extends ConnectionRegistry {
  add(entry: RegistryEntry): void;
  remove(connectionId: string): void;
  /** Update connection metadata (e.g. after token refresh) */
  updateMeta(connectionId: string, meta: Record<string, unknown>): void;
  /** Get raw entry (internal — for token refresh handler) */
  getEntry(connectionId: string): RegistryEntry | undefined;
  /** Inject topic manager after creation (breaks circular init dependency) */
  setTopicManager(tm: ServerTopicManager): void;
}

/**
 * Create a connection registry that tracks active WebSocket connections.
 * Works alongside ServerTopicManager — registry owns connection metadata
 * and messaging, topicManager owns subscription lifecycle.
 *
 * TopicManager is injected lazily via `setTopicManager` to break
 * the circular init dependency (bridge needs registry, topicManager needs bridge hooks).
 *
 * @returns Internal registry with add/remove + public send/broadcast API
 *
 * @example
 * const registry = createConnectionRegistry();
 * registry.add({ connectionId, meta, connectedAt, sendRaw, close });
 * registry.broadcastToTopic("chat.room#abc", { text: "hi" });
 * registry.broadcastToBaseTopic("chat.room", { text: "to all rooms" });
 * registry.sendToConnection(connId, "notifications", { alert: true });
 */
export function createConnectionRegistry(): InternalConnectionRegistry {
  const entries = new Map<string, RegistryEntry>();
  let topicManager: ServerTopicManager | undefined;
  let broadcastSeq = 0;

  function toInfo(entry: RegistryEntry): ConnectionInfo {
    return {
      connectionId: entry.connectionId,
      meta: entry.meta,
      connectedAt: entry.connectedAt,
      topicCount: topicManager?.topicCount(entry.connectionId) ?? 0,
    };
  }

  return {
    get count() {
      return entries.size;
    },

    get(connectionId) {
      const entry = entries.get(connectionId);
      return entry ? toInfo(entry) : undefined;
    },

    has(connectionId) {
      return entries.has(connectionId);
    },

    list() {
      return [...entries.values()].map(toInfo);
    },

    getByMeta(predicate) {
      const result: ConnectionInfo[] = [];
      for (const entry of entries.values()) {
        if (predicate(entry.meta)) result.push(toInfo(entry));
      }
      return result;
    },

    send(connectionId, data) {
      entries.get(connectionId)?.sendRaw({ type: "data", payload: data, seq: ++broadcastSeq });
    },

    async broadcast(data, exclude) {
      const seq = ++broadcastSeq;
      const encoded = encodeMessage({ type: "data", payload: data, seq });
      const snapshot = [...entries];
      let sent = 0;
      for (const [id, entry] of snapshot) {
        if (id !== exclude) entry.sendEncoded(encoded);
        if (++sent % BATCH_SIZE === 0) await yieldTick();
      }
    },

    async broadcastToTopic(topic, data, exclude) {
      const subscriberIds = topicManager?.subscribers(topic);
      if (!subscriberIds?.size) return;
      const encoded = encodeMessage({ type: "data", topic, payload: data, seq: ++broadcastSeq });
      const snapshot = [...subscriberIds];
      let sent = 0;
      for (const id of snapshot) {
        if (id !== exclude) entries.get(id)?.sendEncoded(encoded);
        if (++sent % BATCH_SIZE === 0) await yieldTick();
      }
    },

    async broadcastToBaseTopic(baseTopic, data, exclude) {
      const qualifiedTopics = topicManager?.topicsByBase(baseTopic);
      if (!qualifiedTopics?.size) return;
      const topicSnapshot = [...qualifiedTopics];
      let sent = 0;
      for (const qualifiedTopic of topicSnapshot) {
        const subscriberIds = topicManager?.subscribers(qualifiedTopic);
        if (!subscriberIds?.size) continue;
        const encoded = encodeMessage({
          type: "data",
          topic: qualifiedTopic,
          payload: data,
          seq: ++broadcastSeq,
        });
        const snapshot = [...subscriberIds];
        for (const id of snapshot) {
          if (id !== exclude) entries.get(id)?.sendEncoded(encoded);
          if (++sent % BATCH_SIZE === 0) await yieldTick();
        }
      }
    },

    sendToConnection(connectionId, topic, data) {
      entries
        .get(connectionId)
        ?.sendRaw({ type: "data", topic, payload: data, seq: ++broadcastSeq });
    },

    disconnect(connectionId, code, reason) {
      entries.get(connectionId)?.close(code ?? 1000, reason ?? "Disconnected by server");
    },

    disconnectByMeta(predicate, code, reason) {
      for (const entry of [...entries.values()]) {
        if (predicate(entry.meta)) {
          entry.close(code ?? 1000, reason ?? "Disconnected by server");
        }
      }
    },

    add(entry) {
      entries.set(entry.connectionId, entry);
    },

    remove(connectionId) {
      entries.delete(connectionId);
    },

    updateMeta(connectionId, meta) {
      const entry = entries.get(connectionId);
      if (entry) entry.meta = meta;
    },

    getEntry(connectionId) {
      return entries.get(connectionId);
    },

    setTopicManager(tm) {
      topicManager = tm;
    },
  };
}
