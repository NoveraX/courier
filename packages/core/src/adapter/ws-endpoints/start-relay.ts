/**
 * A subscription to a channel another server serves, relayed: this server
 * subscribes to it where the channel's definition says, as a direct caller
 * would, and passes each frame on — the upstream's data to the client, the
 * client's messages upstream, and how the upstream subscription ended.
 */

import { describeFailure } from "../../realtime/describe-failure";
import type { RealtimeError } from "../../realtime/errors";
import { credentialsFor } from "../../realtime/ws/ws-credentials";
import type { WSConnectionConfig } from "../../realtime/ws/ws-types";
import { channelAddress } from "../../transport/direct/channel-address";
import { socketTransportOf, transportOwnerOf } from "../../transport/direct/source-transport";
import { sourceHeadersOf } from "../../transport/direct/stream-request";
import { lazyChannel } from "../../transport/lazy-streams";
import { layerHeaders } from "../../utils/layer-headers";
import { sha256Hex } from "../../utils/sha256-hex";
import type { WSSocketContext } from "../ws-context";
import { closeSubscriptionEntry } from "../ws-dispatch-helpers";
import { sendSubscriptionEnd } from "../ws-subscription-end";
import { emitChannelMessage } from "./emit-channel-message";

/** What a client hears of a message the upstream had no room to take. */
const NOT_RELAYED = { code: 4429, message: "Message not relayed: the upstream has no room for it" };

/** The channel relayed: the source it belongs to, its group, and its name */
export interface RelayTarget {
  api: object;
  /** Empty for a source without groups */
  group: string;
  method: string;
}

/**
 * Relay a subscription to a channel another server serves.
 *
 * The upstream is opened with the headers the subscription is relayed
 * with — the source's `headers`, then what the proxy sends on every call:
 * the request headers its policy lets through, the user's session and
 * `forward`, whatever the middleware set — as a relayed stream is — and
 * with the source's own `WebSocket` class and connection options, the
 * `dispatcher` that carries a client certificate or a proxy. The
 * subscriptions relayed with the same headers share an upstream socket, as
 * a direct caller's channels do; two users' never share one, nor two
 * sources' that carry transports of their own. An error the
 * upstream ends it with ends the client's, with the upstream's code; an
 * error about one message is passed on and the subscription goes on. The
 * client leaving lets go of the upstream subscription.
 *
 * @param ctx - The client's socket
 * @param topic - The topic the client is subscribed under
 * @param target - The channel
 * @param variables - Its validated variables
 * @param headers - What the subscription's middleware and session produced
 * @example
 * ```ts
 * startRelay(ctx, 'api.chat.room#{"room":"r1"}', { api, group: "chat", method: "room" }, { room: "r1" }, headers);
 * ```
 */
export function startRelay(
  ctx: WSSocketContext,
  topic: string,
  target: RelayTarget,
  variables: unknown,
  headers: Headers,
): void {
  const address = channelAddress(target.api, target.group, target.method, variables);
  const options = upstreamOptions(target.api, layerHeaders(sourceHeadersOf(target.api), headers));
  /* The channel client loads with the first relayed channel. */
  const upstream = lazyChannel(
    import("../../realtime/ws-channel-client").then(({ executeWSChannel }) =>
      executeWSChannel<unknown, unknown>(address.url, address.topic, variables, options),
    ),
  );
  let ended = false;
  const end = (error?: RealtimeError): void => {
    if (ended) return;
    ended = true;
    sendSubscriptionEnd(
      ctx,
      topic,
      undefined,
      error && describeFailure(error, "Upstream subscription failed"),
    );
    closeSubscriptionEntry(ctx, topic, error ? "error" : "complete");
    void ctx.topicManager.unsubscribe(ctx.connectionId, topic);
  };
  upstream.on("data", (payload) => {
    ctx.sendMessage({ type: "data", topic, payload });
    emitChannelMessage(ctx, topic, payload, "data");
  });
  /* An error the upstream reports while it takes a message — one too large —
     reaches the client on its own, so the message's drop is not told twice. */
  let refusedWhileSending = false;
  /* The error the upstream ends a subscription with comes just before the
     channel reports itself disconnected. */
  upstream.on("error", (error) => {
    refusedWhileSending = true;
    queueMicrotask(() => {
      if (upstream.status === "disconnected") end(error);
      else if (!ended)
        ctx.sendMessage({ type: "error", topic, error: describeFailure(error, "Upstream error") });
    });
  });
  upstream.on("status", (status) => {
    if (status === "disconnected") queueMicrotask(() => end());
  });
  ctx.topicManager.subscribe(ctx.connectionId, {
    topic,
    cleanup: async () => {
      ended = true;
      upstream.close();
    },
    onMessage: async (payload) => {
      refusedWhileSending = false;
      const kept = upstream.send(payload);
      if (kept || refusedWhileSending || ended || upstream.status === "disconnected") return;
      /* No room left to hold it while the upstream comes back or drains:
         dropped there, it was only warned of in this server's log. */
      ctx.sendMessage({ type: "error", topic, error: NOT_RELAYED });
    },
  });
}

/* An upstream socket opened with these headers on its handshake, shared by
   the subscriptions relayed with the same: named by their digest, so the
   credentials do not sit in the pool's keys. */
async function upstreamOptions(
  api: object,
  sent: Record<string, string>,
): Promise<Partial<WSConnectionConfig>> {
  const shareKey = await sha256Hex(JSON.stringify(Object.entries(sent).sort()));
  const credentials = () => credentialsFor(sent, undefined);
  const transport = socketTransportOf(api);
  if (Object.keys(transport).length === 0) return { shareKey, credentials };
  return { ...transport, shareKey: `${shareKey}:${transportOwnerOf(api)}`, credentials };
}
