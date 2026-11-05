import { createLogger } from "../../logger";
import { ChannelHandle } from "../../realtime/channel-handle";
import { checkResponseNow } from "../../realtime/check-response-now";
import { fromErrorCode, type RealtimeError } from "../../realtime/errors";
import type { SubscriptionSink } from "../../realtime/subscription-driver";
import type { ChannelHandlers, WSChannelContext } from "../../realtime/types";
import { receiveClientMessage } from "./receive-client-message";
import type { InProcessStreamSchema } from "./shared";
import type { InProcessWSChannel } from "./types";

const log = createLogger("WS");

/** An in-process channel: the context its handlers get, and the channel its caller holds. */
export interface ChannelState {
  /** The WSChannelContext the server handlers receive. */
  channelCtx: WSChannelContext;
  /** The channel the in-process caller holds. */
  client: InProcessWSChannel;
  /** Hand this channel's client what a peer broadcast, already held to the schema. */
  deliver: (data: unknown) => void;
  /** `onJoin` ran: the channel is open. */
  markOpen: () => void;
}

export interface ChannelStateInit {
  topic: string;
  variables: unknown;
  connectionId: string;
  schema: InProcessStreamSchema;
  handlers: ChannelHandlers;
  broadcast: (topic: string, data: unknown, excludeConnectionId?: string) => void;
  unsubscribeFromRegistry: () => void;
}

/**
 * An in-process channel, as one served over a socket behaves for its
 * caller: what the handlers send reaches the caller's channel — what `onJoin`
 * sent kept for its first reader, who listens once the channel is returned —
 * a message the caller sends reaches `onMessage`, and `ctx.close()` ends the
 * caller's channel, with the error a code other than 1000 names. Closing it
 * from either side runs `onLeave` once.
 *
 * @param init - The channel's topic, handlers and broadcast registry
 * @returns The handlers' context and the caller's channel
 */
export function createChannelState(init: ChannelStateInit): ChannelState {
  const { topic, variables, connectionId, schema, handlers, broadcast, unsubscribeFromRegistry } =
    init;
  let sink: SubscriptionSink<unknown> | undefined;
  let closed = false;
  const ended = new AbortController();

  /* Held to the response schema as the server holds what it sends. */
  const outbound = (data: unknown): unknown =>
    schema.response ? checkResponseNow(schema.response, data) : data;

  const channelCtx: WSChannelContext = {
    topic,
    variables: variables ?? {},
    connectionId,
    meta: {},
    signal: ended.signal,
    recovered: false,
    send: (data) => sink?.data({ data: outbound(data) }),
    broadcast: (t, data) => broadcast(t, outbound(data), connectionId),
    close: (code, reason) => {
      const failed = code !== undefined && code !== 1000;
      void shut(failed ? fromErrorCode(code, reason ?? "Channel closed") : undefined, true);
    },
  };

  async function shut(error: RealtimeError | undefined, byServer: boolean): Promise<void> {
    if (closed) return;
    closed = true;
    ended.abort();
    unsubscribeFromRegistry();
    try {
      await handlers.onLeave?.(channelCtx);
    } catch (failure) {
      /* Isolated so it cannot keep the channel from ending, but not hidden. */
      log.warn("onLeave handler failed", failure);
    }
    if (byServer) sink?.end(error);
  }

  const client = new ChannelHandle<unknown, unknown, Promise<void>>(
    {
      open: (to) => {
        sink = to;
      },
      /* Served in process: there is no connection to make again. */
      reconnect: () => undefined,
      close: () => void shut(undefined, false),
    },
    (data) =>
      receiveClientMessage({ topic, schema, handlers, channelCtx, isClosed: () => closed }, data),
  );

  return {
    channelCtx,
    client,
    deliver: (data) => sink?.data({ data }),
    markOpen: () => sink?.open({ resumed: false }),
  };
}
