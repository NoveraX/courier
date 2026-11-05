import { createLogger } from "../logger";
import { createRefusalLog } from "../logger/refusal-log";
import type { WebSocketLike } from "../realtime/adapters";
import { createHeartbeat } from "../realtime/ws/heartbeat";
import { prepareSources } from "../sources";
import { studioHooks } from "../studio";
import { assertAllowedOrigins } from "./assert-allowed-origins";
import type { ConnectResult } from "./connection-meta";
import { LIMITS } from "./limits";
import { rememberPeerAddress } from "./peer-address";
import { admitSocket } from "./ws-admission";
import { admitConnection } from "./ws-admit-connection";
import { connectionFields } from "./ws-connection-fields";
import { buildContext, type WSSocketContext } from "./ws-context";
import { holdFrames, type WSInbox } from "./ws-inbox";
import { createIPTracker } from "./ws-ip-tracker";
import { wireEvents } from "./ws-lifecycle";
import { createLiveConnections } from "./ws-live-connections";
import { createPubSubBridge } from "./ws-pubsub-bridge";
import { createConnectionRegistry } from "./ws-registry";
import { replicateBroadcasts } from "./ws-replicated-registry";
import { createServerTopicManager } from "./ws-topics";
import type { WSHandler, WSHandlerConfig } from "./ws-types";

export type { WSSocketContext } from "./ws-context";

const log = createLogger("WS");

/**
 * Create a server-side WebSocket handler for Courier endpoints.
 *
 * Unless `config.sources` names them, sources are read lazily from the core
 * global registry when each connection opens; call `await attachRuntime()`
 * in your server instrumentation to populate it before the first request.
 *
 * @param config - Handler configuration (pubsub, heartbeat, lifecycle hooks, etc.)
 * @returns WSHandler with handleSocket and connections registry
 * @throws ConfigurationError when `config.sources` is not a dictionary of sources
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
  const bridge = config.pubsub ? createPubSubBridge(config.pubsub, registry, refusals) : undefined;
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
  let stopping: Promise<void> | undefined;

  function handleSocket(ws: WebSocketLike, request: Request, peerAddress?: string): void {
    rememberPeerAddress(request, peerAddress);
    const ctx = buildContext(ws, config, topicManager, registry, bridge, request, refusals);
    if (stopping) {
      ctx.session.close({ kind: "shutdown", retryAfterMs: 0 });
      return;
    }
    live.add(ws, ctx);
    const admission = admitSocket(request, config, ipTracker);
    if (!("ip" in admission)) {
      ctx.session.close(admission);
      return;
    }
    ctx.clientIP = admission.ip;
    /* What the client sends before its connection is admitted — who it is,
       the subscriptions it makes as its socket opens — waits for it, in order. */
    const inbox = holdFrames(ws, ctx.maxControlPerSecond, (held) => {
      const fields = { ...connectionFields(ctx), held };
      refusals.warn({ event: "frames refused", code: 4429, fields });
      ctx.session.close({ kind: "flood" });
    });

    if (config.onConnect) {
      /* What fails while a connection is admitted ends that connection, never the process. */
      initConnection(ws, inbox, ctx, config.onConnect).catch((error: unknown) => {
        log.error(`Connection ${ctx.connectionId} could not be admitted`, error);
        ipTracker.release(ctx.clientIP);
        ctx.session.close({ kind: "internal" });
      });
    } else {
      registerAndActivate(ws, inbox, ctx);
    }
  }

  async function initConnection(
    ws: WebSocketLike,
    inbox: WSInbox,
    ctx: WSSocketContext,
    onConnect: NonNullable<WSHandlerConfig["onConnect"]>,
  ): Promise<void> {
    /* Heard from the start, not once the connection is activated: a client
       that left while onConnect ran would otherwise keep its registry entry,
       a heartbeat timer and its per-address slot for good — enough of them
       lock the address out. */
    let closedWith: number | undefined;
    ws.addEventListener("close", (event) => {
      closedWith ??= event.code;
    });
    const outcome = await admitConnection(ctx, inbox, {
      onConnect,
      onDisconnect: config.onDisconnect,
      authTimeoutMs: config.authTimeoutMs ?? 3000,
      hookTimeoutMs: ctx.middlewareTimeoutMs,
      left: () => closedWith,
    });
    if (outcome === "admitted") {
      registerAndActivate(ws, inbox, ctx);
      return;
    }
    ipTracker.release(ctx.clientIP);
    ctx.session.dispose();
  }

  function registerAndActivate(ws: WebSocketLike, inbox: WSInbox, ctx: WSSocketContext): void {
    const { session } = ctx;
    registry.add({
      connectionId: ctx.connectionId,
      meta: ctx.meta,
      connectedAt: Date.now(),
      sendRaw: ctx.sendMessage,
      sendEncoded: ctx.sendEncoded,
      close: (code, reason) => session.close({ kind: "application", code, reason }),
      requireAuth: (timeoutMs) => session.requireAuth(timeoutMs ?? ctx.authRequiredTimeoutMs),
    });
    const hb = createHeartbeat(
      () => ctx.sendMessage({ type: "ping" }),
      () => session.close({ kind: "heartbeat-timeout" }),
      {
        intervalMs: config.heartbeatIntervalMs ?? 25_000,
        timeoutMs: config.heartbeatTimeoutMs ?? 10_000,
      },
    );
    hb.start();
    bridge?.onConnectionOpen();
    wireEvents(ws, inbox, ctx, hb, topicManager, config, registry, ipTracker);
  }

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
    bridge?.destroy();
  }

  function destroy(options?: { timeoutMs?: number | undefined }): Promise<void> {
    stopping ??= stop(options?.timeoutMs ?? LIMITS.WS_SHUTDOWN_TIMEOUT_MS);
    return stopping;
  }

  /* With a pub/sub adapter, what the application broadcasts through the
     registry reaches every replica, as a channel's ctx.broadcast does. */
  const connections = bridge ? replicateBroadcasts(registry, bridge) : registry;
  return { handleSocket, connections, destroy };
}
