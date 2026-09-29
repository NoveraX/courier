/**
 * A subscription to a channel another server serves, relayed: this server
 * subscribes to it where the channel's definition says, as a direct caller
 * would, and passes each frame on — the upstream's data to the client, the
 * client's messages upstream, and how the upstream subscription ended.
 */

import { describeFailure } from "../../realtime/describe-failure";
import type { RealtimeError } from "../../realtime/errors";
import { channelAddress } from "../../transport/direct/channel-address";
import { lazyChannel } from "../../transport/lazy-streams";
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
 * The upstream subscription is shared by every subscriber of this server
 * with the same variables, as a direct caller's are. An error the upstream
 * ends it with ends the client's, with the upstream's code; an error about
 * one message is passed on and the subscription goes on. The client leaving
 * lets go of the upstream subscription.
 *
 * @param ctx - The client's socket
 * @param topic - The topic the client is subscribed under
 * @param target - The channel
 * @param variables - Its validated variables
 * @example
 * ```ts
 * startRelay(ctx, 'api.chat.room#{"room":"r1"}', { api, group: "chat", method: "room" }, { room: "r1" });
 * ```
 */
export function startRelay(
  ctx: WSSocketContext,
  topic: string,
  target: RelayTarget,
  variables: unknown,
): void {
  const address = channelAddress(target.api, target.group, target.method, variables);
  /* The channel client loads with the first relayed channel. */
  const upstream = lazyChannel(
    import("../../realtime/ws-channel-client").then(({ executeWSChannel }) =>
      executeWSChannel<unknown, unknown>(address.url, address.topic, variables),
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
