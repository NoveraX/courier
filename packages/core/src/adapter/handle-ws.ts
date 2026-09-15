import { createLogger } from "../logger";
import type { WebSocketLike } from "../realtime/adapters";
import { createHeartbeat } from "../realtime/ws/heartbeat";
import { studioHooks } from "../studio";
import { LIMITS } from "./limits";
import { validateOrigin } from "./ws-auth";
import { buildContext, type WSSocketContext } from "./ws-context";
import { createIPTracker, extractClientIP } from "./ws-ip-tracker";
import { wireEvents } from "./ws-lifecycle";
import { createPubSubBridge } from "./ws-pubsub-bridge";
import { createConnectionRegistry } from "./ws-registry";
import { createServerTopicManager } from "./ws-topics";
import type { WSHandler, WSHandlerConfig } from "./ws-types";

export type { WSSocketContext } from "./ws-context";

const log = createLogger("WS");

/**
 * Create a server-side WebSocket handler for Nexus endpoints.
 *
 * Sources are read lazily from the core global registry at request time
 * via `requireSources()`. Pass only the behavioral options here; call
 * `await attachRuntime()` in your server instrumentation to populate
 * the sources registry before the first request.
 *
 * @param config - Handler configuration (pubsub, heartbeat, lifecycle hooks, etc.)
 * @returns WSHandler with handleSocket and connections registry
 * @example
 * const ws = createWSHandler({
 *   onConnect: ({ connectionId, request }) => ({ userId: extractUser(request) }),
 *   onDisconnect: ({ connectionId, meta }) => removePresence(meta.userId),
 * });
 * ws.handleSocket(socket, request);
 * ws.connections.broadcast({ type: "system", text: "Welcome!" });
 */
export function createWSHandler(config: WSHandlerConfig = {}): WSHandler {
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

  function handleSocket(ws: WebSocketLike, request: Request): void {
    if (!validateOrigin(request, config.allowedOrigins)) {
      ws.close(4403, "Origin not allowed");
      return;
    }

    const ip = extractClientIP(request);
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
    registerAndActivate(ws, ctx);
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

  return { handleSocket, connections: registry, destroy };
}
