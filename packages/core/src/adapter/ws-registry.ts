import {
  type BroadcastTargets,
  broadcastToAll,
  broadcastToBaseTopic,
  broadcastToTopic,
} from "./ws-registry-broadcast";
import type {
  ConnectionInfo,
  InternalConnectionRegistry,
  RegistryEntry,
} from "./ws-registry-types";
import type { ServerTopicManager } from "./ws-topics";

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

  const targets: BroadcastTargets = {
    entries,
    get topicManager() {
      return topicManager;
    },
    nextSeq: () => ++broadcastSeq,
  };

  function toInfo(entry: RegistryEntry): ConnectionInfo {
    return {
      connectionId: entry.connectionId,
      meta: entry.meta,
      connectedAt: entry.connectedAt,
      topicCount: topicManager?.topicCount(entry.connectionId) ?? 0,
    };
  }

  function close(entry: RegistryEntry, code?: number, reason?: string): void {
    entry.close(code ?? 1000, reason ?? "Disconnected by server");
  }

  return {
    get count() {
      return entries.size;
    },
    get(connectionId) {
      const entry = entries.get(connectionId);
      return entry ? toInfo(entry) : undefined;
    },
    has: (connectionId) => entries.has(connectionId),
    list: () => [...entries.values()].map(toInfo),
    getByMeta(predicate) {
      return [...entries.values()].filter((entry) => predicate(entry.meta)).map(toInfo);
    },
    send(connectionId, data) {
      entries.get(connectionId)?.sendRaw({ type: "data", payload: data, seq: ++broadcastSeq });
    },
    broadcast: (data, exclude) => broadcastToAll(targets, data, exclude),
    broadcastToTopic: (topic, data, exclude) => broadcastToTopic(targets, topic, data, exclude),
    broadcastToBaseTopic: (baseTopic, data, exclude) =>
      broadcastToBaseTopic(targets, baseTopic, data, exclude),
    sendToConnection(connectionId, topic, data) {
      entries
        .get(connectionId)
        ?.sendRaw({ type: "data", topic, payload: data, seq: ++broadcastSeq });
    },
    disconnect(connectionId, code, reason) {
      const entry = entries.get(connectionId);
      if (entry) close(entry, code, reason);
    },
    disconnectByMeta(predicate, code, reason) {
      for (const entry of [...entries.values()]) {
        if (predicate(entry.meta)) close(entry, code, reason);
      }
    },
    add(entry) {
      entries.set(entry.connectionId, entry);
    },
    remove(connectionId) {
      clearTimeout(entries.get(connectionId)?.authDeadline);
      entries.delete(connectionId);
    },
    updateMeta(connectionId, meta) {
      const entry = entries.get(connectionId);
      if (entry) entry.meta = meta;
    },
    getEntry: (connectionId) => entries.get(connectionId),
    setTopicManager(tm) {
      topicManager = tm;
    },
  };
}
