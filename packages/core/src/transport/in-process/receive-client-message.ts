import { createLogger } from "../../logger";
import type { ChannelHandlers, WSChannelContext } from "../../realtime/types";
import { validateSchema } from "../../validation";
import { type InProcessStreamSchema, wrapStreamError } from "./shared";

const log = createLogger("WS");

const EXECUTOR = "executeDirectWSChannel";

/** The channel a message from the in-process client is for. */
export interface ClientMessageTarget {
  topic: string;
  schema: InProcessStreamSchema;
  handlers: ChannelHandlers;
  channelCtx: WSChannelContext;
  /** Whether the channel was closed: what is sent after is dropped. */
  isClosed: () => boolean;
}

/**
 * Hand what the in-process client sent to the channel's `onMessage`, as the
 * server hands it a message from a socket: held to the receive schema, and a
 * turn later, so an answer the handler sends at once still comes after the
 * message it answers. A message sent once the channel was closed is dropped
 * with a warning, as a closed network channel drops it.
 *
 * @param target - The channel the message is for
 * @param data - What the client sent
 * @returns Settles once the handler has; rejects with the receive-schema
 *   failure or the handler's error
 *
 * @example
 * ```ts
 * await receiveClientMessage({ topic, schema, handlers, channelCtx, isClosed }, { text: "hi" });
 * ```
 */
export async function receiveClientMessage(
  target: ClientMessageTarget,
  data: unknown,
): Promise<void> {
  if (target.isClosed()) {
    log.warn(`Message not sent: the channel ${target.topic} has ended`);
    return;
  }
  await Promise.resolve();
  const { schema, handlers, channelCtx } = target;
  const validated = schema.receive
    ? await validateSchema(schema.receive as Parameters<typeof validateSchema>[0], data, "receive")
    : data;
  try {
    await handlers.onMessage(channelCtx, validated);
  } catch (error) {
    throw wrapStreamError(EXECUTOR, "onMessage failed", error);
  }
}
