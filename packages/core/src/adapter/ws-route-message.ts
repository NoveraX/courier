import { createLogger } from "../logger";
import type { createHeartbeat } from "../realtime/ws/heartbeat";
import { decodeMessage, type WSMessage } from "../realtime/ws/ws-protocol";
import type { WSSocketContext } from "./ws-context";
import { handleMessage, handleSubscribe, handleUnsubscribe } from "./ws-dispatch";
import { consumeToken } from "./ws-rate-limit";
import { handleTokenRefresh } from "./ws-token-refresh";

const log = createLogger("WS");

/** Decode, validate, and route an inbound WS message */
export function routeMessage(
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
    ctx.sendMessage({
      type: "error",
      ...(msg.id !== undefined && { id: msg.id }),
      ...(msg.topic !== undefined && { topic: msg.topic }),
      error: { code: 4429, message: "Rate limited" },
    });
    return;
  }

  if (msg.type === "message") {
    void handleMessage(ctx, msg).catch((err) =>
      log.error("WS dispatch failed", { type: "message", err }),
    );
  }
}
