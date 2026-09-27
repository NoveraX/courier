import type { PubSubBridge } from "./ws-pubsub-bridge";
import type { ConnectionRegistry, InternalConnectionRegistry } from "./ws-registry";

/**
 * The connection registry application code is handed when replicas share a
 * pub/sub adapter: its broadcasts reach the connections of every replica,
 * not only this one's. What concerns single connections — `count`, `list`,
 * `send`, `disconnect` — stays with this replica, which holds them.
 *
 * Only a channel handler's `ctx.broadcast` used to publish: an application
 * broadcasting after an HTTP mutation reached the clients of the replica
 * that took the request, and calling `pubsub.publish` as well skipped that
 * replica, because a replica ignores its own publishes.
 *
 * @param registry - This replica's connections
 * @param bridge - The replica's pub/sub bridge
 * @returns The registry to expose as `connections`
 *
 * @example
 * const connections = replicateBroadcasts(registry, bridge);
 * await connections.broadcastToBaseTopic("api.chat.room", { text: "to every room" });
 */
export function replicateBroadcasts(
  registry: InternalConnectionRegistry,
  bridge: PubSubBridge,
): ConnectionRegistry {
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
  };
}
