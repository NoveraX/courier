import { encodeMessage } from "@noverax/courier/internal";
import type { WebSocket as NodeWebSocket } from "ws";

import type { WSConnectionRegistry } from "./connection-registry";
import type { MessageRouterContext } from "./message-router";
import { sendSubscriptionEnd } from "./protocol";

/** What one subscription's context is made from. */
export interface ChannelContextInput {
  readonly ws: NodeWebSocket;
  /** The topic as the client subscribed to it, which every frame it is sent names */
  readonly topic: string;
  readonly variables: Record<string, unknown>;
  readonly connectionId: string;
  readonly registry: WSConnectionRegistry;
  /** Fires when the subscription ends */
  readonly signal: AbortSignal;
  /** Ends the subscription, once the client has been told */
  readonly end: () => void;
}

/**
 * The context a subscription's handlers receive. `send` answers on the
 * topic the client subscribed to — the source name, then the variables as
 * canonical JSON after `#` — which its client dispatches frames by; once
 * the subscription has ended it sends nothing, so a timer the handlers left
 * running cannot reach a subscription the socket took up again on the same
 * topic. `close` ends this subscription alone: the socket serves the others.
 *
 * @param input - The socket, the subscription's topic and variables, and how it ends
 * @returns The context
 * @example
 * ```ts
 * const ctx = buildChannelContext({ ws, topic, variables, connectionId, registry, signal, end });
 * ```
 */
export function buildChannelContext(input: ChannelContextInput): MessageRouterContext {
  const { ws, registry, signal } = input;
  const ctx: MessageRouterContext = {
    topic: input.topic,
    variables: input.variables,
    connectionId: input.connectionId,
    meta: emptyMeta(),
    signal,
    send(data: unknown) {
      if (signal.aborted || ws.readyState !== ws.OPEN) return;
      ws.send(encodeMessage({ type: "data", topic: ctx.topic, payload: data }));
    },
    broadcast(targetTopic: string, data: unknown) {
      registry.broadcast(targetTopic, data, ws);
    },
    close(code?: number, reason?: string) {
      if (signal.aborted) return;
      const failed = code !== undefined && code !== 1000;
      const failure = failed ? { code, message: reason ?? "Channel closed" } : undefined;
      sendSubscriptionEnd(ws, ctx.topic, undefined, failure);
      input.end();
    },
  };
  return ctx;
}

/* What a channel keeps about its connection, filled by the handler. */
function emptyMeta(): Record<string, unknown> {
  return {};
}
