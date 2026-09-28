/**
 * A caller's `message` and `unsubscribe` on the proxy's WebSocket route,
 * answered as a Courier server answers them.
 */

import { logger } from "@noverax/courier";
import { describeFailure, type WSMessage } from "@noverax/courier/realtime";
import { checkAgainst } from "./check-schema";
import { sendFrame, sendRefusal } from "./frames";
import { leaveSubscription } from "./subscription";
import type { ProxySocket } from "./types";

/**
 * Hand a message to the channel it is sent on, checked against what the
 * channel declares it receives. One sent while its subscription is still
 * opening waits for it; one on a topic the socket does not hold, or on a
 * channel that receives nothing, is refused.
 *
 * @param socket - The socket it arrived on
 * @param message - The `message`
 * @example
 * ```ts
 * await handleMessage(socket, { type: "message", topic: served, payload: { text: "hi" } });
 * ```
 */
export async function handleMessage(socket: ProxySocket, message: WSMessage): Promise<void> {
  const topic = message.topic;
  const opening = topic === undefined ? undefined : socket.opening.get(topic);
  if (opening) await Promise.allSettled([opening]);
  const subscription = topic === undefined ? undefined : socket.subscriptions.get(topic);
  if (!subscription)
    return sendRefusal(socket.ws, message, { code: 4404, message: "Not subscribed" });
  const { shape } = subscription;
  if (shape && !shape.acceptsMessages) {
    return sendRefusal(socket.ws, message, {
      code: 4400,
      message: "Endpoint does not accept messages",
    });
  }
  const checked = await checkAgainst(shape?.receive, message.payload);
  if ("issues" in checked) {
    const failure = { code: 4422, message: "Invalid message payload", issues: checked.issues };
    return sendRefusal(socket.ws, message, failure);
  }
  try {
    await subscription.handlers.onMessage(subscription.ctx, checked.value);
  } catch (error) {
    logger.warn("MockWS", `onMessage threw (${subscription.id})`, error);
    sendRefusal(socket.ws, message, describeFailure(error, "Handler error"));
  }
}

/**
 * End the subscription an `unsubscribe` names, and confirm it — also for a
 * topic the socket no longer holds, as a Courier server does.
 *
 * @param socket - The socket it arrived on
 * @param message - The `unsubscribe`
 * @example
 * ```ts
 * await handleUnsubscribe(socket, { type: "unsubscribe", id: "2", topic: served });
 * ```
 */
export async function handleUnsubscribe(socket: ProxySocket, message: WSMessage): Promise<void> {
  const topic = message.topic;
  if (topic === undefined) return;
  const subscription = socket.subscriptions.get(topic);
  if (subscription) await leaveSubscription(socket, topic, subscription);
  sendFrame(socket.ws, {
    type: "unsubscribed",
    ...(message.id !== undefined && { id: message.id }),
    topic,
  });
}
