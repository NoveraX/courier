import type { WebSocketLike } from "../realtime/adapters";
import { createHeartbeat } from "../realtime/ws/heartbeat";
import type { WSSocketContext } from "./ws-context";
import { WS_DEFAULTS } from "./ws-defaults";
import { authOkFrame } from "./ws-handshake";
import type { WSInbox } from "./ws-inbox";
import { wireEvents } from "./ws-lifecycle";
import type { SocketOpening } from "./ws-open-socket";
import type { CommandTarget } from "./ws-registry-types";
import { sendTopicFrame } from "./ws-resume";

/**
 * What the application's commands reach of a connection — closing it with
 * its code, giving it up for a newer one, asking for its credentials again
 * — the same from the moment `onConnect` says who it is as once it is let
 * in.
 *
 * @param ctx - The connection
 * @returns Its id and its commands, as the registry runs them
 * @example
 * ```ts
 * registry.join({ ...commandTargetOf(ctx), meta: ctx.meta });
 * ```
 */
export function commandTargetOf(ctx: WSSocketContext): CommandTarget {
  const { session } = ctx;
  return {
    connectionId: ctx.connectionId,
    close: (code, reason) => session.close({ kind: "application", code, reason }),
    requireAuth: (timeoutMs) => session.requireAuth(timeoutMs ?? ctx.authRequiredTimeoutMs),
    evict: () => session.close({ kind: "evicted" }),
  };
}

/**
 * Let a connection in, and start hearing it: its client is sent `auth_ok`
 * — the server's first frame on the socket, with the heartbeat it keeps
 * and the limits it holds the client to, and the credentials a command
 * asked for again while it was admitted — then it is added to the
 * registry, where the application reaches it, and a command closes it by
 * its own session; its heartbeat starts, its key's lease is given up when
 * it closes, and the frames held while it was admitted are handled.
 *
 * @param ws - Its socket
 * @param inbox - What its socket sent before it was admitted
 * @param ctx - The connection
 * @param opening - What the handler lets sockets in with
 * @param authId - The id of the `auth` frame it was admitted on
 *
 * @example
 * ```ts
 * activateConnection(ws, inbox, ctx, opening, "a1");
 * ```
 */
export function activateConnection(
  ws: WebSocketLike,
  inbox: WSInbox,
  ctx: WSSocketContext,
  opening: SocketOpening,
  authId: string | undefined,
): void {
  const { config, registry, ipTracker, bridge, topicManager, limiter } = opening;
  const { session } = ctx;
  const heartbeat = {
    intervalMs: config.heartbeatIntervalMs ?? WS_DEFAULTS.heartbeatIntervalMs,
    timeoutMs: config.heartbeatTimeoutMs ?? WS_DEFAULTS.heartbeatTimeoutMs,
  };
  session.admit(
    authOkFrame({
      id: authId,
      connectionId: ctx.connectionId,
      heartbeat,
      limits: { maxMessageSize: ctx.maxMessageSize, maxSubscriptions: ctx.maxSubscriptions },
    }),
  );
  registry.add({
    ...commandTargetOf(ctx),
    meta: ctx.meta,
    connectedAt: Date.now(),
    sendRaw: ctx.sendMessage,
    sendEncoded: ctx.sendEncoded,
    sendTopicEvent: (topic, position, encoded) => sendTopicFrame(ctx, topic, position, encoded),
  });
  const hb = createHeartbeat(
    () => ctx.sendMessage({ type: "ping" }),
    () => session.close({ kind: "heartbeat-timeout" }),
    heartbeat,
  );
  hb.start();
  if (limiter) ws.addEventListener("close", () => limiter.release(ctx.connectionId));
  bridge?.onConnectionOpen();
  wireEvents(ws, inbox, ctx, hb, topicManager, config, registry, ipTracker);
}
