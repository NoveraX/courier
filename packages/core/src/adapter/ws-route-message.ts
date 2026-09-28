import { createLogger } from "../logger";
import type { createHeartbeat } from "../realtime/ws/heartbeat";
import { decodeMessage, type WSMessage } from "../realtime/ws/ws-protocol";
import type { WSSocketContext } from "./ws-context";
import { handleMessage, handleSubscribe, handleUnsubscribe } from "./ws-dispatch";
import { consumeToken } from "./ws-rate-limit";
import { handleTokenRefresh } from "./ws-token-refresh";

const log = createLogger("WS");

/* The frames that set a connection up: subscriptions and its credentials. */
const CONTROL: ReadonlySet<WSMessage["type"]> = new Set(["subscribe", "unsubscribe", "auth"]);

/** Logs a rejected handler for one message type, with the error it rejected with. */
function dispatchFailed(type: string): (err: unknown) => void {
  return (err) => log.error(`WS "${type}" message could not be handled`, err);
}

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

  // Control messages are counted apart from the rest, so chatty messages
  // cannot hold back an unsubscribe or an auth refresh, yet a flood of them
  // is refused. Each handler is async; a rejection (auth throw, schema
  // crash, registry race) is logged with the error itself instead of
  // becoming an unhandledRejection on the process.
  if (CONTROL.has(msg.type) && !consumeToken(ctx.controlBucket, ctx.maxControlPerSecond)) {
    refuse(ctx, msg);
    return;
  }
  switch (msg.type) {
    case "subscribe":
      void handleSubscribe(ctx, msg).catch(dispatchFailed("subscribe"));
      return;
    case "unsubscribe":
      void handleUnsubscribe(ctx, msg).catch(dispatchFailed("unsubscribe"));
      return;
    case "auth":
      void handleTokenRefresh(ctx, msg).catch(dispatchFailed("auth"));
      return;
    default:
      break;
  }

  if (!consumeToken(ctx.rateLimitBucket, ctx.maxMessagesPerSecond)) {
    refuse(ctx, msg);
    return;
  }

  if (msg.type === "message") {
    void handleMessage(ctx, msg).catch(dispatchFailed("message"));
  }
}

/* A refusal names the frame it answers, so the client fails that subscription or request. */
function refuse(ctx: WSSocketContext, msg: WSMessage): void {
  ctx.sendMessage({
    type: "error",
    ...(msg.id !== undefined && { id: msg.id }),
    ...(msg.topic !== undefined && { topic: msg.topic }),
    error: { code: 4429, message: "Rate limited" },
  });
}
