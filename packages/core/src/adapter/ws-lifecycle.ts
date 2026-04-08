import { createLogger } from "../logger";
import type { WebSocketLike } from "../realtime/adapters";
import type { createHeartbeat } from "../realtime/ws/heartbeat";
import type { WSMessage } from "../realtime/ws/ws-protocol";
import { decodeMessage } from "../realtime/ws/ws-protocol";
import { registerPlaygroundAbort } from "../studio";
import type { WSSocketContext } from "./ws-context";
import { handleMessage, handleSubscribe, handleUnsubscribe } from "./ws-dispatch";
import { closeSubscriptionEntry } from "./ws-dispatch-helpers";
import type { IPTracker } from "./ws-ip-tracker";
import { consumeToken } from "./ws-rate-limit";
import type { InternalConnectionRegistry } from "./ws-registry";
import { handleTokenRefresh } from "./ws-token-refresh";
import type { createServerTopicManager } from "./ws-topics";
import type { WSHandlerConfig } from "./ws-types";

const log = createLogger("WS");

/** Wire message, close, and error event listeners on an active socket */
export function wireEvents(
  ws: WebSocketLike,
  ctx: WSSocketContext,
  heartbeat: ReturnType<typeof createHeartbeat>,
  topicManager: ReturnType<typeof createServerTopicManager>,
  config: WSHandlerConfig,
  registry: InternalConnectionRegistry,
  ipTracker?: IPTracker,
): void {
  // Studio Playground correlation: register an in-process abort callback so
  // the playground executor can force-close this socket via the global
  // registry. Without this, Node loopback fetch abort doesn't propagate to
  // the WS upgrade and the user sees "Unsubscribe" do nothing. The unregister
  // fires from the close listener below so the registry doesn't leak entries
  // across reconnect cycles.
  const unregisterPlaygroundAbort = ctx.playgroundRequestId
    ? registerPlaygroundAbort(ctx.playgroundRequestId, () => {
        try {
          ws.close(1000, "Cancelled by Studio Playground");
        } catch {
          // ws may already be closing — ignore.
        }
      })
    : undefined;

  ws.addEventListener("message", (event) => {
    const raw = typeof event.data === "string" ? event.data : String(event.data);
    routeMessage(ctx, raw, heartbeat);
  });

  ws.addEventListener("close", async (event) => {
    // Mark closed FIRST so any in-flight `handleSubscribe` await chain bails
    // out on its next guard check before mutating per-connection state.
    ctx.closed = true;
    unregisterPlaygroundAbort?.();
    heartbeat.stop();
    ipTracker?.release(ctx.clientIP);
    registry.remove(ctx.connectionId);
    await topicManager.disconnectAll(ctx.connectionId);

    // Close each per-subscription stream entry. We snapshot the topic list
    // first because closeSubscriptionEntry mutates ctx.subscriptionIds, and
    // we route through the helper so the delete-before-fire ownership claim
    // protects against re-entrant hooks (a Studio onWSUntrack callback that
    // calls back into closeSubscriptionEntry would otherwise double-fire).
    const closingTopics = Array.from(ctx.subscriptionIds.keys());
    for (const topic of closingTopics) {
      closeSubscriptionEntry(ctx, topic, "disconnect");
    }
    try {
      await config.onDisconnect?.({
        connectionId: ctx.connectionId,
        meta: ctx.meta,
        code: event.code,
      });
    } catch (err) {
      log.warn("onDisconnect hook failed", err);
    }
  });

  ws.addEventListener("error", (event) => {
    heartbeat.stop();
    try {
      config.onError?.({ connectionId: ctx.connectionId, meta: ctx.meta, error: event });
    } catch (err) {
      log.warn("onError hook failed", err);
    }
  });
}

/** Decode, validate, and route an inbound WS message */
function routeMessage(
  ctx: WSSocketContext,
  raw: string,
  heartbeat: ReturnType<typeof createHeartbeat>,
): void {
  if (raw.length > ctx.maxMessageSize) {
    ctx.sendMessage({ type: "error", error: { code: 4413, message: "Message too large" } });
    return;
  }

  let msg: WSMessage;
  try {
    msg = decodeMessage(raw);
  } catch {
    ctx.sendMessage({ type: "error", error: { code: 4400, message: "Invalid message format" } });
    return;
  }

  // Control messages (ping/pong) are exempt from rate limiting
  if (msg.type === "ping") {
    ctx.sendMessage({ type: "pong" });
    return;
  }
  if (msg.type === "pong") {
    heartbeat.receivedPong();
    return;
  }

  // Control messages bypass rate limiting —
  // dropping them would leak subscriptions, block cleanup, or stall auth.
  // Each handler is async; wrap with `void ... .catch(log.error)` so any
  // unhandled rejection (auth throw, schema crash, registry race) is observed
  // and logged instead of becoming an unhandledRejection on the process.
  switch (msg.type) {
    case "subscribe":
      void handleSubscribe(ctx, msg).catch((err) =>
        log.error("WS dispatch failed", { type: "subscribe", err }),
      );
      return;
    case "unsubscribe":
      void handleUnsubscribe(ctx, msg).catch((err) =>
        log.error("WS dispatch failed", { type: "unsubscribe", err }),
      );
      return;
    case "auth":
      void handleTokenRefresh(ctx, msg).catch((err) =>
        log.error("WS dispatch failed", { type: "auth", err }),
      );
      return;
    default:
      break;
  }

  if (!consumeToken(ctx.rateLimitBucket, ctx.maxMessagesPerSecond)) {
    ctx.sendMessage({ type: "error", error: { code: 4429, message: "Rate limited" } });
    return;
  }

  if (msg.type === "message") {
    void handleMessage(ctx, msg).catch((err) =>
      log.error("WS dispatch failed", { type: "message", err }),
    );
  }
}
