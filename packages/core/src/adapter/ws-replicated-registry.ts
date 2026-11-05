import type { ClusterControl } from "./cluster-control";
import {
  type CheckedCommand,
  disconnectCommand,
  evictCommand,
  requireAuthCommand,
  runCommand,
} from "./ws-connection-command";
import type { PubSubBridge } from "./ws-pubsub-bridge";
import type { InternalConnectionRegistry } from "./ws-registry-types";

/**
 * The connection registry application code is handed when replicas share a
 * pub/sub adapter: its broadcasts reach the connections of every replica,
 * not only this one's, and so do its commands — `disconnect` and
 * `requireAuth` reach the connections a selector names wherever they are
 * held. What reads or writes one connection by its id — `count`, `get`,
 * `list`, `send` — stays with this replica, which holds them.
 *
 * An application broadcasting after an HTTP mutation reaches every replica's
 * clients through it, as a channel handler's `ctx.broadcast` does; calling
 * `pubsub.publish` itself would skip the replica that took the request,
 * because a replica ignores its own publishes.
 *
 * @param registry - This replica's connections
 * @param bridge - The replica's pub/sub bridge
 * @param control - The replicas' control channel
 * @returns The registry to expose as `connections`, which still reaches this
 *   replica's connections for what the handler does with them itself
 *
 * @example
 * const connections = replicateRegistry(registry, bridge, control);
 * await connections.broadcastToBaseTopic("api.chat.room", { text: "to every room" });
 * await connections.disconnect({ meta: { userId: "u1" } }, { code: 4003, reason: "Banned" });
 */
export function replicateRegistry(
  registry: InternalConnectionRegistry,
  bridge: PubSubBridge,
  control: ClusterControl,
): InternalConnectionRegistry {
  /* A connection is held by one replica alone: when each id named is this
     one's, no other has any of them. */
  async function everywhere(checked: CheckedCommand): Promise<void> {
    const reached = runCommand(checked, registry);
    const { selection } = checked;
    if ("ids" in selection && reached.length === new Set(selection.ids).size) return;
    await control.send(checked.command);
  }

  return {
    get count() {
      return registry.count;
    },
    get: (connectionId) => registry.get(connectionId),
    has: (connectionId) => registry.has(connectionId),
    list: (selector) => registry.list(selector),
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
    disconnect: async (selector, options) => everywhere(disconnectCommand(selector, options)),
    requireAuth: async (selector, options) => everywhere(requireAuthCommand(selector, options)),
    evict: async (connectionIds) => everywhere(evictCommand(connectionIds)),
    add: (entry) => registry.add(entry),
    remove: (connectionId) => registry.remove(connectionId),
    updateMeta: (connectionId, meta) => registry.updateMeta(connectionId, meta),
    getEntry: (connectionId) => registry.getEntry(connectionId),
    select: (selection) => registry.select(selection),
    setTopicManager: (topicManager) => registry.setTopicManager(topicManager),
  };
}
