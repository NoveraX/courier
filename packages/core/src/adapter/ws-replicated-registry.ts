import type { PubSubBridge } from "./ws-pubsub-bridge";
import type { InternalConnectionRegistry } from "./ws-registry-types";

/**
 * The connection registry application code is handed when replicas share a
 * pub/sub adapter: its broadcasts reach the connections of every replica,
 * not only this one's. What concerns single connections — `count`, `list`,
 * `send`, `disconnect` — stays with this replica, which holds them.
 *
 * An application broadcasting after an HTTP mutation reaches every replica's
 * clients through it, as a channel handler's `ctx.broadcast` does; calling
 * `pubsub.publish` itself would skip the replica that took the request,
 * because a replica ignores its own publishes.
 *
 * @param registry - This replica's connections
 * @param bridge - The replica's pub/sub bridge
 * @returns The registry to expose as `connections`, which still reaches this
 *   replica's connections for what the handler does with them itself
 *
 * @example
 * const connections = replicateBroadcasts(registry, bridge);
 * await connections.broadcastToBaseTopic("api.chat.room", { text: "to every room" });
 */
export function replicateBroadcasts(
  registry: InternalConnectionRegistry,
  bridge: PubSubBridge,
): InternalConnectionRegistry {
  return {
    get count() {
      return registry.count;
    },
    get: (connectionId) => registry.get(connectionId),
    has: (connectionId) => registry.has(connectionId),
    list: () => registry.list(),
    getByMeta: (predicate) => registry.getByMeta(predicate),
    send: (connectionId, data) => registry.send(connectionId, data),
    async broadcast(data, exclude) {
      await Promise.all([registry.broadcast(data, exclude), bridge.publishToAll(data)]);
    },
    async broadcastToTopic(topic, data, exclude) {
      await Promise.all([
        registry.broadcastToTopic(topic, data, exclude),
        bridge.publishToTopic(topic, data),
      ]);
    },
    async broadcastToBaseTopic(baseTopic, data, exclude) {
      await Promise.all([
        registry.broadcastToBaseTopic(baseTopic, data, exclude),
        bridge.publishToBaseTopic(baseTopic, data),
      ]);
    },
    sendToConnection: (connectionId, topic, data) =>
      registry.sendToConnection(connectionId, topic, data),
    disconnect: (connectionId, code, reason) => registry.disconnect(connectionId, code, reason),
    disconnectByMeta: (predicate, code, reason) =>
      registry.disconnectByMeta(predicate, code, reason),
    add: (entry) => registry.add(entry),
    remove: (connectionId) => registry.remove(connectionId),
    updateMeta: (connectionId, meta) => registry.updateMeta(connectionId, meta),
    getEntry: (connectionId) => registry.getEntry(connectionId),
    setTopicManager: (topicManager) => registry.setTopicManager(topicManager),
  };
}
