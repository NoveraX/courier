import { ChannelHandle } from "./channel-handle";
import type { WSChannel } from "./subscription-types";
import type { WSConnectionConfig } from "./ws/ws-types";
import { topicDriver } from "./ws-topic-driver";

/**
 * Execute a WS bidirectional channel: what calling a channel the caller can
 * send on returns — a subscription, and `send`.
 *
 * What the server says about the channel reaches it: a refused message or a
 * failed handler as an `error` event, and the end of the subscription —
 * finished, or refused with a `RealtimeError` — as an `error` event where
 * there is one, then `disconnected` and `close`. It is `connected` once the
 * server has confirmed the subscription, not as soon as the socket opens.
 *
 * What is sent before the server has confirmed the subscription — right
 * after opening the channel, or while it rejoins after a reconnect — waits
 * for the confirmation, in order, instead of being refused as not subscribed.
 *
 * @param url - The WebSocket URL
 * @param topic - The endpoint's topic
 * @param variables - The subscription's variables
 * @param config - The socket's options, or a promise of them
 * @returns The channel
 * @example
 * ```ts
 * const room = executeWSChannel<{ text: string }, string>(url, "api.chat.room", { room: "a" });
 * room.on("data", (line) => console.log(line));
 * room.send({ text: "hello" });
 * ```
 */
export function executeWSChannel<TSend, TReceive>(
  url: string,
  topic: string,
  variables?: unknown,
  config?: Partial<WSConnectionConfig> | Promise<Partial<WSConnectionConfig> | undefined>,
): WSChannel<TSend, TReceive> {
  const driver = topicDriver<TReceive>(url, topic, variables, config);
  return new ChannelHandle<TSend, TReceive>(driver, (data) => driver.send(data));
}
