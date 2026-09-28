import { createLogger } from "../logger";
import type { WebSocketLike } from "../realtime/adapters";
import { createHeartbeat } from "../realtime/ws/heartbeat";
import { prepareSources } from "../sources";
import { studioHooks } from "../studio";
import { isHostAllowed } from "./host-policy";
import { LIMITS } from "./limits";
import { isOriginAllowed } from "./origin-policy";
import { rememberPeerAddress } from "./peer-address";
import { buildContext, type WSSocketContext } from "./ws-context";
import { createIPTracker, extractClientIP } from "./ws-ip-tracker";
import { wireEvents } from "./ws-lifecycle";
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
export function createWSHandler(config: WSHandlerConfig = {}): WSHandler {
  if (config.sources !== undefined) {
    prepareSources(config.sources, "createWSHandler", "createWSHandler({ sources: { api } })");
  }
  const registry = createConnectionRegistry();
  const maxPerIP = config.maxConnectionsPerIP ?? LIMITS.MAX_CONNECTIONS_PER_IP;
  const ipTracker = createIPTracker(maxPerIP);
  const bridge = config.pubsub ? createPubSubBridge(config.pubsub, registry) : undefined;
  const topicManager = createServerTopicManager(
    bridge
      ? {
          onFirstSubscriber: (topic) => bridge.onTopicSubscribe(topic),
          onLastUnsubscriber: (topic) => bridge.onTopicUnsubscribe(topic),
        }
      : undefined,
  );
  registry.setTopicManager(topicManager);

  function handleSocket(ws: WebSocketLike, request: Request, peerAddress?: string): void {
    rememberPeerAddress(request, peerAddress);
    if (!isHostAllowed(request, config.allowedHosts)) {
      ws.close(4421, "Host not allowed");
      return;
    }
    if (!isOriginAllowed(request, config.allowedOrigins)) {
      ws.close(4403, "Origin not allowed");
      return;
    }

    const ip = extractClientIP(request, config.clientIp);
    if (!ipTracker.acquire(ip)) {
      ws.close(4429, "Too many connections");
      return;
    }

    const ctx = buildContext(ws, config, topicManager, registry, bridge, request);
    ctx.clientIP = ip;

    if (config.onConnect) {
      void initConnection(ws, ctx);
    } else {
      registerAndActivate(ws, ctx);
    }
  }

  async function initConnection(ws: WebSocketLike, ctx: WSSocketContext): Promise<void> {
    /* The socket's own close listener is attached only once the connection
       is activated, so a client that left while onConnect ran used to keep
       its registry entry, a heartbeat timer and its per-address slot for
       good — enough of them locked the address out. */
    let closedWith: number | undefined;
    ws.addEventListener("close", (event) => {
      closedWith ??= event.code;
    });

    try {
      const onConnect = config.onConnect;
      if (onConnect) {
        const result = await onConnect({ connectionId: ctx.connectionId, request: ctx.request });
        ctx.meta = (result as Record<string, unknown>) ?? {};
      }
    } catch (err) {
      log.warn("Connection rejected by onConnect", err);
      ipTracker.release(ctx.clientIP);
      ws.close(4401, "Connection rejected");
      return;
    }

    if (closedWith !== undefined) {
      ipTracker.release(ctx.clientIP);
      await notifyDisconnect(ctx, closedWith);
      return;
    }
    registerAndActivate(ws, ctx);
  }

  /** Let the application undo what its onConnect set up. */
  async function notifyDisconnect(ctx: WSSocketContext, code: number): Promise<void> {
    try {
      await config.onDisconnect?.({ connectionId: ctx.connectionId, meta: ctx.meta, code });
    } catch (error) {
      log.warn("onDisconnect hook failed", error);
    }
  }

  function registerAndActivate(ws: WebSocketLike, ctx: WSSocketContext): void {
    registry.add({
      connectionId: ctx.connectionId,
      meta: ctx.meta,
      connectedAt: Date.now(),
      sendRaw: ctx.sendMessage,
      sendEncoded: ctx.sendEncoded,
      close: (code, reason) => ws.close(code, reason),
    });
    const hb = createHeartbeat(
      () => ctx.sendMessage({ type: "ping" }),
      () => ws.close(4408, "Heartbeat timeout"),
      {
        intervalMs: config.heartbeatIntervalMs ?? 25_000,
        timeoutMs: config.heartbeatTimeoutMs ?? 10_000,
      },
    );
    hb.start();
    void bridge?.onConnectionOpen();
    wireEvents(ws, ctx, hb, topicManager, config, registry, ipTracker);
  }

  // Wire Studio playground WS send — allows playground to relay messages to active connections
  studioHooks.sendWSMessage = (connectionId, topic, data) => {
    if (!registry.has(connectionId)) return false;
    registry.sendToConnection(connectionId, topic, data);
    return true;
  };

  async function destroy(): Promise<void> {
    studioHooks.sendWSMessage = undefined;
    await bridge?.destroy();
  }

  /* With a pub/sub adapter, what the application broadcasts through the
     registry reaches every replica, as a channel's ctx.broadcast does. */
  const connections = bridge ? replicateBroadcasts(registry, bridge) : registry;
  return { handleSocket, connections, destroy };
}
