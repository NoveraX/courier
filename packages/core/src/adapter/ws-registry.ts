import { createRefusalLog, type RefusalLog } from "../logger/refusal-log";
import type { TopicLog } from "../realtime/adapters";
import { hasFields, readSelector } from "./connection-selector";
import {
  disconnectCommand,
  evictCommand,
  requireAuthCommand,
  runCommand,
} from "./ws-connection-command";
import { createLogFollower } from "./ws-log-follower";
import {
  type BroadcastTargets,
  broadcastToAll,
  broadcastToBaseTopic,
  broadcastToTopic,
  resyncEvery,
} from "./ws-registry-broadcast";
import type {
  ConnectionInfo,
  InternalConnectionRegistry,
  RegistryEntry,
} from "./ws-registry-types";
import { resumableFrom } from "./ws-resume-position";
import type { TopicHistory } from "./ws-topic-history";
import { createTopicSequences } from "./ws-topic-sequences";
import type { ServerTopicManager } from "./ws-topics";

/** What a registry delivers topics' events with besides its connections. */
export interface RegistryOptions {
  /** The events kept to resume subscriptions from, when the handler keeps history */
  history?: TopicHistory | undefined;
  /** The pub/sub adapter's log, which numbers each topic's events for every replica, when it keeps one */
  log?: TopicLog | undefined;
  /** The handler's log of refusals, for a topic log that does not answer */
  refusals?: RefusalLog | undefined;
}

/**
 * Create a connection registry that tracks active WebSocket connections.
 * Works alongside ServerTopicManager — registry owns connection metadata
 * and messaging, topicManager owns subscription lifecycle.
 *
 * TopicManager is injected lazily via `setTopicManager` to break
 * the circular init dependency (bridge needs registry, topicManager needs bridge hooks).
 *
 * Alone, it reaches this replica's connections; with a pub/sub adapter
 * `replicateRegistry` carries its broadcasts and commands to the others.
 *
 * @param options - The history it keeps, and the log it follows
 * @returns Internal registry with add/remove + public send/broadcast API
 *
 * @example
 * const registry = createConnectionRegistry();
 * registry.add({ connectionId, meta, connectedAt, sendRaw, close });
 * registry.broadcastToTopic('api.chat.room#{"room":"a"}', { text: "hi" });
 * registry.broadcastToBaseTopic("api.chat.room", { text: "to all rooms" });
 * registry.sendToConnection(connId, "notifications", { alert: true });
 * await registry.disconnect({ meta: { userId: "u1" } }, { code: 4003, reason: "Banned" });
 */
export function createConnectionRegistry(
  options: RegistryOptions = {},
): InternalConnectionRegistry {
  const { history, log } = options;
  const entries = new Map<string, RegistryEntry>();
  let topicManager: ServerTopicManager | undefined;
  const sequences = createTopicSequences();

  const targets: BroadcastTargets = {
    entries,
    get topicManager() {
      return topicManager;
    },
    sequences,
    history,
  };
  const follower =
    log && createLogFollower(targets, log, options.refusals ?? createRefusalLog("WS"));

  function toInfo(entry: RegistryEntry): ConnectionInfo {
    return {
      connectionId: entry.connectionId,
      meta: entry.meta,
      connectedAt: entry.connectedAt,
      topicCount: topicManager?.topicCount(entry.connectionId) ?? 0,
    };
  }

  const registry: InternalConnectionRegistry = {
    get count() {
      return entries.size;
    },
    get(connectionId) {
      const entry = entries.get(connectionId);
      return entry ? toInfo(entry) : undefined;
    },
    has: (connectionId) => entries.has(connectionId),
    list(selector) {
      if (selector === undefined) return [...entries.values()].map(toInfo);
      const selection = readSelector(selector);
      if (typeof selection === "string") throw new TypeError(selection);
      return registry.select(selection).map(toInfo);
    },
    send(connectionId, data) {
      entries.get(connectionId)?.sendRaw({ type: "data", payload: data });
    },
    broadcast: (data, exclude) => broadcastToAll(targets, data, exclude),
    broadcastToTopic: (topic, data, exclude) => broadcastToTopic(targets, topic, data, exclude),
    broadcastToBaseTopic: (baseTopic, data, exclude) =>
      broadcastToBaseTopic(targets, baseTopic, data, exclude),
    sendToConnection(connectionId, topic, data) {
      entries.get(connectionId)?.sendRaw({ type: "data", topic, payload: data });
    },
    async disconnect(selector, options) {
      runCommand(disconnectCommand(selector, options), registry);
    },
    async requireAuth(selector, options) {
      runCommand(requireAuthCommand(selector, options), registry);
    },
    async evict(connectionIds) {
      runCommand(evictCommand(connectionIds), registry);
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
    getEntry: (connectionId) => entries.get(connectionId),
    select(selection) {
      if ("ids" in selection) {
        const named = [...new Set(selection.ids)].map((id) => entries.get(id));
        return named.filter((entry): entry is RegistryEntry => entry !== undefined);
      }
      return [...entries.values()].filter((entry) => hasFields(entry.meta, selection.fields));
    },
    setTopicManager(tm) {
      topicManager = tm;
    },
    positionOf: (topic) => sequences.position(topic),
    forgetTopic(topic) {
      sequences.forget(topic);
      history?.drop(topic);
    },
    eventsAfter(topic, since) {
      const from = resumableFrom(since);
      if (!history || !from || !sequences.has(topic)) return undefined;
      const { seq, epoch } = sequences.position(topic);
      if (from.epoch !== epoch || from.seq > seq) return undefined;
      return history.between(topic, from.seq, seq);
    },
    deliverLogged(topic, payload, logged) {
      if (follower) follower.deliver(topic, payload, logged);
      else void broadcastToTopic(targets, topic, payload, logged.exclude);
    },
    follows: (topic) => sequences.has(topic),
    follow: (topic, position) => sequences.follow(topic, position),
    catchUp: async () => (follower ? follower.catchUp() : resyncEvery(targets)),
  };
  return registry;
}
