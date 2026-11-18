import { LIMITS } from "../limits";
import type { RefusalLog } from "../logger/refusal-log";
import { createRefusalLog } from "../logger/refusal-log";
import { provideServerCapabilities } from "../server/provide-server-capabilities";
import { prepareSources } from "../server/sources";
import { studioHooks } from "../studio";
import { ownFields } from "../utils/own";
import type { ConnectResult } from "./connection-meta";
import { gateEntry } from "./entry-gate";
import { createHTTPTransport, type HTTPTransport } from "./http-transport/create-http-transport";
import { httpTermsOf } from "./http-transport/http-terms";
import { errorResponse } from "./parse";
import { rememberPeerAddress } from "./peer-address";
import { assertListedSettings } from "./runtime-policy";
import { assertHandlerTerms } from "./ws-client-terms";
import { createHandlerCounters, type WSHandlerStats } from "./ws-handler-stats";
import { createIPTracker } from "./ws-ip-tracker";
import { connectionLimitOf } from "./ws-limit-rule";
import { createLiveConnections } from "./ws-live-connections";
import { openSockets } from "./ws-open-socket";
import { createConnectionRegistry } from "./ws-registry";
import { replicate } from "./ws-replication";
import { WS_SERVER_LIMITS } from "./ws-server-limits";
import { shutdownClose } from "./ws-shutdown";
import { createTopicHistory } from "./ws-topic-history";
import { wireTopics } from "./ws-topic-wiring";
import type { WSHandler, WSHandlerConfig } from "./ws-types";

export type { WSSocketContext } from "./ws-context";

/**
 * Create a server-side WebSocket handler for Courier endpoints.
 *
 * Unless `config.sources` names them, sources are read lazily from the core
 * global registry when each connection opens; call `await attachRuntime()`
 * in your server instrumentation to populate it before the first request.
 *
 * Its connections are sockets, and, unless `config.http` is `false`,
 * connections over HTTP for clients whose network lets no socket through:
 * an adapter hands `handleHTTP` the `POST` requests to the socket's path.
 *
 * @param config - Handler configuration (pubsub, heartbeat, lifecycle hooks, etc.)
 * @returns WSHandler with handleSocket, handleHTTP and connections registry
 * @throws ConfigurationError when `config.sources` is not a dictionary of sources,
 *   `config.cluster.secret` is shorter than 32 bytes, the heartbeat or `maxMessageSize` it
 *   would tell each client is one no client keeps, or a wait of `config.http` is none a timer
 *   keeps
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
export function createWSHandler(given?: WSHandlerConfig): WSHandler {
  /* The handler's settings, as each of its parts reads them: their own. */
  const config = ownFields(given);
  provideServerCapabilities();
  assertListedSettings(config, "createWSHandler");
  assertHandlerTerms(config);
  const httpTerms = httpTermsOf(config);
  if (config.sources !== undefined) {
    prepareSources(config.sources, "createWSHandler", "createWSHandler({ sources: { api } })");
  }
  const history = config.history ? createTopicHistory(config.history) : undefined;
  /* One log of refusals for every connection of the handler, so a client
     that keeps being refused takes up one line an interval, not one each. */
  const refusals = createRefusalLog("WS");
  const registry = createConnectionRegistry({ history, log: config.pubsub?.log, refusals });
  const maxPerIP = config.maxConnectionsPerIP ?? LIMITS.MAX_CONNECTIONS_PER_IP;
  const ipTracker = createIPTracker(maxPerIP);
  const replication = replicate(config, registry, refusals);
  const bridge = replication?.bridge;
  /* With a pub/sub adapter, what the application broadcasts through the
     registry reaches every replica, as a channel's ctx.broadcast does, and
     so do the connections it closes or asks for credentials again. */
  const connections = replication?.connections ?? registry;
  const { topicManager, retention } = wireTopics(registry, bridge, history);
  const live = createLiveConnections();
  const counters = createHandlerCounters();
  const limiter = connectionLimitOf(config, refusals);
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
    limiter,
    evict: (connectionIds) => {
      connections.evict(connectionIds).catch((error: unknown) => {
        refusals.warn({ event: "eviction not sent", code: "PUBSUB_STOPPED" }, error);
      });
    },
    stopping: () => stopping !== undefined,
  });
  /* Requests that reach a replica other than their connection's holder go on to it over the
     replicas' adapter. */
  const cluster = replication && {
    pubsub: replication.pubsub,
    secret: replication.secret,
    refusals,
  };
  const http = httpTerms && createHTTPTransport(httpTerms, handleSocket, cluster);

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
    await live.closeAll(shutdownClose, timeoutMs);
    http?.destroy();
    studioHooks.sendWSMessage = undefined;
    limiter?.destroy();
    retention.destroy();
    replication?.destroy();
  }

  function destroy(options?: { timeoutMs?: number | undefined }): Promise<void> {
    stopping ??= stop(options?.timeoutMs ?? WS_SERVER_LIMITS.SHUTDOWN_TIMEOUT_MS);
    return stopping;
  }

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
      http: http?.stats(),
    };
  }

  const handleHTTP = httpEntryOf(http, config, refusals);
  return { handleSocket, handleHTTP, connections, destroy, stats };
}

/* The HTTP transport's entry, held to the hosts and origins the handler's sockets are; without
   the transport, nothing is there. */
function httpEntryOf(
  http: HTTPTransport | undefined,
  config: WSHandlerConfig,
  refusals: RefusalLog,
): WSHandler["handleHTTP"] {
  if (http === undefined) {
    return async () => errorResponse(404, "This handler has no HTTP transport", "NOT_FOUND");
  }
  const { allowedHosts, allowedOrigins } = config;
  const gated = gateEntry(
    (request) => http.handle(request),
    { allowedHosts, allowedOrigins },
    studioHooks,
    refusals,
  );
  return (request, peerAddress) => {
    rememberPeerAddress(request, peerAddress);
    return gated(request);
  };
}
