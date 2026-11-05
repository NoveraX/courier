import { createRefusalLog } from "../logger/refusal-log";
import { prepareSources } from "../sources";
import { studioHooks } from "../studio";
import { assertAllowedOrigins } from "./assert-allowed-origins";
import type { ConnectResult } from "./connection-meta";
import { LIMITS } from "./limits";
import { createHandlerCounters, type WSHandlerStats } from "./ws-handler-stats";
import { createIPTracker } from "./ws-ip-tracker";
import { createLiveConnections } from "./ws-live-connections";
import { openSockets } from "./ws-open-socket";
import { createConnectionRegistry } from "./ws-registry";
import { replicate } from "./ws-replication";
import { createServerTopicManager } from "./ws-topics";
import type { WSHandler, WSHandlerConfig } from "./ws-types";

export type { WSSocketContext } from "./ws-context";

/**
 * Create a server-side WebSocket handler for Courier endpoints.
 *
 * Unless `config.sources` names them, sources are read lazily from the core
 * global registry when each connection opens; call `await attachRuntime()`
 * in your server instrumentation to populate it before the first request.
 *
 * @param config - Handler configuration (pubsub, heartbeat, lifecycle hooks, etc.)
 * @returns WSHandler with handleSocket and connections registry
 * @throws ConfigurationError when `config.sources` is not a dictionary of sources, or
 *   `config.cluster.secret` is shorter than 32 bytes
 * @example
 * const ws = createWSHandler({
 *   onConnect: ({ connectionId, request }) => ({ userId: extractUser(request) }),
 *   onDisconnect: ({ connectionId, meta }) => removePresence(meta.userId),
 * });
 * ws.handleSocket(socket, request);
 * ws.connections.broadcast({ type: "system", text: "Welcome!" });
 */
export function createWSHandler<TConnect extends ConnectResult = ConnectResult>(
  config?: WSHandlerConfig<TConnect>,
): WSHandler;
export function createWSHandler(config: WSHandlerConfig = {}): WSHandler {
  assertAllowedOrigins(config.allowedOrigins, "createWSHandler");
  if (config.sources !== undefined) {
    prepareSources(config.sources, "createWSHandler", "createWSHandler({ sources: { api } })");
  }
  const registry = createConnectionRegistry();
  /* One log of refusals for every connection of the handler, so a client
     that keeps being refused takes up one line an interval, not one each. */
  const refusals = createRefusalLog("WS");
  const maxPerIP = config.maxConnectionsPerIP ?? LIMITS.MAX_CONNECTIONS_PER_IP;
  const ipTracker = createIPTracker(maxPerIP);
  const replication = replicate(config, registry, refusals);
  const bridge = replication?.bridge;
  const topicManager = createServerTopicManager(
    bridge
      ? {
          onFirstSubscriber: (topic) => bridge.onTopicSubscribe(topic),
          onLastUnsubscriber: (topic) => bridge.onTopicUnsubscribe(topic),
        }
      : undefined,
  );
  registry.setTopicManager(topicManager);
  const live = createLiveConnections();
  const counters = createHandlerCounters();
  let stopping: Promise<void> | undefined;

  const handleSocket = openSockets({
    config,
    registry,
    refusals,
    ipTracker,
    bridge,
    topicManager,
    live,
    counters,
    stopping: () => stopping !== undefined,
  });

  // Wire Studio playground WS send — allows playground to relay messages to active connections
  studioHooks.sendWSMessage = (connectionId, topic, data) => {
    if (!registry.has(connectionId)) return false;
    registry.sendToConnection(connectionId, topic, data);
    return true;
  };

  /* Every socket is closed — told when to come back, spread so they do not
     all at once — and waited for within the deadline; the subscriptions on
     the pub/sub adapter are let go of without waiting on it. */
  async function stop(timeoutMs: number): Promise<void> {
    const spread = LIMITS.WS_SHUTDOWN_RECONNECT_SPREAD_MS;
    const shutdown = () =>
      ({ kind: "shutdown", retryAfterMs: Math.floor(Math.random() * spread) }) as const;
    await live.closeAll(shutdown, timeoutMs);
    studioHooks.sendWSMessage = undefined;
    replication?.destroy();
  }

  function destroy(options?: { timeoutMs?: number | undefined }): Promise<void> {
    stopping ??= stop(options?.timeoutMs ?? LIMITS.WS_SHUTDOWN_TIMEOUT_MS);
    return stopping;
  }

  /* With a pub/sub adapter, what the application broadcasts through the
     registry reaches every replica, as a channel's ctx.broadcast does, and
     so do the connections it closes or asks for credentials again. */
  const connections = replication?.connections ?? registry;

  function stats(): WSHandlerStats {
    const { topics, subscriptions } = topicManager.counts();
    return {
      connections: registry.count,
      admitting: live.size - registry.count,
      topics,
      subscriptions,
      closed: counters.closed,
      droppedFrames: counters.droppedFrames,
      stopping: stopping !== undefined,
      pubsub: config.pubsub?.stats(),
    };
  }

  return { handleSocket, connections, destroy, stats };
}
