import { ChannelHandle, OBSERVE_SENT } from "../../realtime/channel-handle";
import type { Subscription } from "../../realtime/subscription-types";
import { beginStream, type StreamMeta } from "./core";
import { instrumentSSE, watchSubscription } from "./sse";

/**
 * Show a WebSocket channel in Studio: what the server sent on it, tagged
 * `data`, each message the channel took to send, tagged `message` — one it
 * dropped is not shown — how its connection stands, and how it ended. It is
 * watched, not wrapped, so a channel whose `send` settles — the in-process
 * one does — keeps doing so for its caller.
 *
 * Reconnect cycles do not end its entry: the entry spans the channel's life,
 * not one socket's.
 *
 * @param channel - The channel
 * @param meta - What Studio shows it as
 * @param externalRequestId - The id Studio opened it under, when Studio opened it
 * @returns The same channel
 */
export function instrumentWSChannel<TChannel extends Subscription<unknown>>(
  channel: TChannel,
  meta: StreamMeta,
  externalRequestId?: string,
): TChannel {
  const instr = beginStream(meta, externalRequestId);
  if (!instr) return channel;
  const stop = watchSubscription(channel, instr, (data) => instr.emitMessage(data, "data"));
  if (channel instanceof ChannelHandle) {
    const unsent = channel[OBSERVE_SENT]((data) => instr.emitMessage(data, "message"));
    channel.on("close", () => {
      unsent();
      stop();
    });
  }
  return channel;
}

/**
 * Show a WS push subscription in Studio, as a stream is shown. A push Studio
 * opened itself is shown under the id it names.
 *
 * @param subscription - The subscription
 * @param meta - What Studio shows it as
 * @param externalRequestId - The id Studio opened it under, when Studio opened it
 * @returns The same subscription
 */
export function instrumentWSPush<TSubscription extends Subscription<unknown>>(
  subscription: TSubscription,
  meta: StreamMeta,
  externalRequestId?: string,
): TSubscription {
  return instrumentSSE(
    subscription,
    meta,
    externalRequestId === undefined ? undefined : beginStream(meta, externalRequestId),
  );
}
