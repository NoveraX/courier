import type { WebSocketLike } from "../realtime/adapters";
import { createHeartbeat } from "../realtime/ws/heartbeat";
import type { WSSocketContext } from "./ws-context";
import type { WSInbox } from "./ws-inbox";
import { wireEvents } from "./ws-lifecycle";
import type { SocketOpening } from "./ws-open-socket";
import { sendTopicFrame } from "./ws-resume";

/**
 * Register a connection let in, and start hearing it: it joins the
 * registry — where the application reaches it, and a command closes it by
 * its own session — its heartbeat starts, its key's lease is given up when
 * it closes, and the frames held while it was admitted are handled.
 *
 * @param ws - Its socket
 * @param inbox - What its socket sent before it was admitted
 * @param ctx - The connection
 * @param opening - What the handler lets sockets in with
 *
 * @example
 * ```ts
 * activateConnection(ws, inbox, ctx, opening);
 * ```
 */
export function activateConnection(
  ws: WebSocketLike,
  inbox: WSInbox,
  ctx: WSSocketContext,
  opening: SocketOpening,
): void {
  const { config, registry, ipTracker, bridge, topicManager, limiter } = opening;
  const { session } = ctx;
  registry.add({
    connectionId: ctx.connectionId,
    meta: ctx.meta,
    connectedAt: Date.now(),
    sendRaw: ctx.sendMessage,
    sendEncoded: ctx.sendEncoded,
    sendTopicEvent: (topic, position, encoded) => sendTopicFrame(ctx, topic, position, encoded),
    close: (code, reason) => session.close({ kind: "application", code, reason }),
    requireAuth: (timeoutMs) => session.requireAuth(timeoutMs ?? ctx.authRequiredTimeoutMs),
    evict: () => session.close({ kind: "evicted" }),
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
  if (limiter) ws.addEventListener("close", () => limiter.release(ctx.connectionId));
  bridge?.onConnectionOpen();
  wireEvents(ws, inbox, ctx, hb, topicManager, config, registry, ipTracker);
}
