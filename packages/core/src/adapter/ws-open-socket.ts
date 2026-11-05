import { createLogger } from "../logger";
import type { RefusalLog } from "../logger/refusal-log";
import type { WebSocketLike } from "../realtime/adapters";
import { rememberPeerAddress } from "./peer-address";
import { activateConnection } from "./ws-activate";
import { admitSocket } from "./ws-admission";
import { admitConnection } from "./ws-admit-connection";
import { connectionFields } from "./ws-connection-fields";
import type { ConnectionLimiter } from "./ws-connection-limit";
import { buildContext, type WSSocketContext } from "./ws-context";
import { V1_DIALECT } from "./ws-dialect";
import type { HandlerCounters } from "./ws-handler-stats";
import { holdFrames, type WSInbox } from "./ws-inbox";
import type { IPTracker } from "./ws-ip-tracker";
import type { LiveConnections } from "./ws-live-connections";
import type { PubSubBridge } from "./ws-pubsub-bridge";
import type { InternalConnectionRegistry } from "./ws-registry-types";
import { createSession, type WSSession } from "./ws-session";
import type { ServerTopicManager } from "./ws-topics";
import type { WSHandlerConfig } from "./ws-types";

const log = createLogger("WS");

/** What a handler lets a socket in with. */
export interface SocketOpening {
  readonly config: WSHandlerConfig;
  readonly registry: InternalConnectionRegistry;
  readonly refusals: RefusalLog;
  readonly ipTracker: IPTracker;
  readonly bridge: PubSubBridge | undefined;
  readonly topicManager: ServerTopicManager;
  readonly live: LiveConnections;
  /** What the handler counts as its sockets close and their frames are dropped */
  readonly counters: HandlerCounters;
  /** The limit on the connections of one key, when the handler has one */
  readonly limiter: ConnectionLimiter | undefined;
  /** Close the connections a limit gave up for newer ones, wherever they are held */
  readonly evict: (connectionIds: readonly string[]) => void;
  /** Whether the handler is stopping, when a socket handed to it is closed at once */
  readonly stopping: () => boolean;
}

/**
 * A handler's way in for a socket: refused for its host, its origin or its
 * address before anything is read for it; admitted, when the handler has
 * `onConnect`, on the credentials of its first frame; then registered and
 * heard. Whatever fails on the way closes the socket, never the process.
 *
 * @param opening - What the handler lets sockets in with
 * @returns `handleSocket`, for the socket an adapter hands over with its upgrade request
 *
 * @example
 * ```ts
 * const handleSocket = openSockets({ config, registry, refusals, ipTracker, bridge, topicManager, live, stopping });
 * handleSocket(socket, request, peerAddress);
 * ```
 */
export function openSockets(
  opening: SocketOpening,
): (ws: WebSocketLike, request: Request, peerAddress?: string) => void {
  const { config, registry, refusals, ipTracker, bridge, topicManager, live, counters, limiter } =
    opening;
  /* Each frame a full buffer drops is counted, before the application's own hook hears of it. */
  const counted: WSHandlerConfig = {
    ...config,
    onMessageDrop(drop) {
      counters.droppedFrame();
      config.onMessageDrop?.(drop);
    },
  };

  /* What fails as a socket let in is set up — no sources registered yet —
     is the server's fault: the socket is closed and why is logged, never
     thrown into the adapter's upgrade, where it would end the process. */
  function contextOf(ws: WebSocketLike, session: WSSession, request: Request, ip: string) {
    try {
      const ctx = buildContext(
        ws,
        session,
        counted,
        topicManager,
        registry,
        bridge,
        request,
        refusals,
      );
      ctx.clientIP = ip;
      return ctx;
    } catch (error) {
      log.error("A connection could not be admitted", error);
      ipTracker.release(ip);
      session.close({ kind: "internal" });
      return undefined;
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
      limit: limiter && ((admitted) => withinLimit(limiter, admitted)),
    });
    if (outcome === "admitted") {
      activateConnection(ws, inbox, ctx, opening);
      return;
    }
    limiter?.release(ctx.connectionId);
    ipTracker.release(ctx.clientIP);
    ctx.session.dispose();
  }

  /* A place under the limit: those given up for it are closed wherever they are held. */
  async function withinLimit(of: ConnectionLimiter, ctx: WSSocketContext): Promise<boolean> {
    const evicted = await of.admit(ctx.connectionId, ctx.meta);
    if (evicted === undefined) return false;
    if (evicted.length > 0) opening.evict(evicted);
    return true;
  }

  return (ws, request, peerAddress) => {
    rememberPeerAddress(request, peerAddress);
    const session = createSession(ws, V1_DIALECT, counters.closedWith);
    if (opening.stopping()) {
      session.close({ kind: "shutdown", retryAfterMs: 0 });
      return;
    }
    live.add(ws, session);
    const admission = admitSocket(request, config, ipTracker);
    if (!("ip" in admission)) {
      session.close(admission);
      return;
    }
    const ctx = contextOf(ws, session, request, admission.ip);
    if (!ctx) return;
    /* What the client sends before its connection is admitted — who it is,
       the subscriptions it makes as its socket opens — waits for it, in order. */
    const inbox = holdFrames(ws, ctx.maxControlPerSecond, (held) => {
      refusals.warn({
        event: "frames refused",
        code: 4429,
        fields: { ...connectionFields(ctx), held },
      });
      ctx.session.close({ kind: "flood" });
    });
    if (!config.onConnect) {
      activateConnection(ws, inbox, ctx, opening);
      return;
    }
    /* What fails while a connection is admitted ends that connection, never the process. */
    initConnection(ws, inbox, ctx, config.onConnect).catch((error: unknown) => {
      log.error(`Connection ${ctx.connectionId} could not be admitted`, error);
      limiter?.release(ctx.connectionId);
      ipTracker.release(ctx.clientIP);
      ctx.session.close({ kind: "internal" });
    });
  };
}
