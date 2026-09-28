import { encodeMessage, type StreamFailure } from "@noverax/courier/realtime";
import type { WebSocket as NodeWebSocket } from "ws";

import type { WSConnectionRegistry } from "./connection-registry";
import { type ConnectionState, parseMessage } from "./message-router";
import { endSubscriptionAndClose } from "./protocol";

/**
 * A channel whose handlers could not be built is refused when the client
 * subscribes — the one moment its topic is known — rather than with an error
 * it could not match and a close it would retry.
 */
export function refuseOnSubscribe(ws: NodeWebSocket, topic: string, failure: StreamFailure): void {
  ws.on("message", (raw: Buffer | string) => {
    const msg = parseMessage(ws, raw);
    if (msg?.type === "subscribe") endSubscriptionAndClose(ws, msg.topic ?? topic, failure);
  });
}

export function buildChannelContext(
  ws: NodeWebSocket,
  initialTopic: string,
  variables: Record<string, unknown>,
  connectionId: string,
  registry: WSConnectionRegistry,
  state: ConnectionState,
) {
  // `topic` is mutable: when the client subscribes with a fully qualified
  // topic — `{source}.{group}.{method}`, then `#` and its variables as
  // canonical JSON — the message router rewrites `ctx.topic` so outbound
  // `data` frames echo the client's exact topic. Without this, clients dispatch frames by topic and would
  // silently drop everything sent under the server-local short topic.
  const ctx = {
    topic: initialTopic,
    variables,
    connectionId,
    meta: {} as Record<string, unknown>,
    signal: state.ended.signal,
    send(data: unknown) {
      if (ws.readyState === ws.OPEN) {
        ws.send(encodeMessage({ type: "data", topic: ctx.topic, payload: data }));
      }
    },
    broadcast(targetTopic: string, data: unknown) {
      registry.broadcast(targetTopic, data, ws);
    },
    close(code?: number, reason?: string) {
      if (state.ended.signal.aborted) return;
      state.ended.abort();
      const failed = code !== undefined && code !== 1000;
      endSubscriptionAndClose(
        ws,
        ctx.topic,
        failed ? { code, message: reason ?? "Channel closed" } : undefined,
      );
    },
  };
  return ctx;
}
