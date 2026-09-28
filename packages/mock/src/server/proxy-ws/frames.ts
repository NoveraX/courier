/**
 * The frames the proxy's WebSocket route sends, each only while its socket
 * is open.
 */

import { encodeMessage, type StreamFailure, type WSMessage } from "@noverax/courier/internal";
import type { WebSocket as NodeWebSocket } from "ws";

/**
 * Send a frame, unless the socket has closed.
 *
 * @param ws - The socket
 * @param message - The frame
 * @example
 * ```ts
 * sendFrame(ws, { type: "pong" });
 * ```
 */
export function sendFrame(ws: NodeWebSocket, message: WSMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(encodeMessage(message));
}

/**
 * End one subscription — failed with `failure`, or finished — and leave the
 * socket and its other subscriptions open, as a Courier server does.
 *
 * @param ws - The socket
 * @param topic - The subscription's topic
 * @param id - The id of the subscribe it answers, if any
 * @param failure - Why it ended; absent when it finished
 * @example
 * ```ts
 * sendEnd(ws, "shop.chat.room#{\"room\":\"r1\"}", "3", { code: 4422, message: "Invalid variables" });
 * ```
 */
export function sendEnd(
  ws: NodeWebSocket,
  topic: string,
  id: string | undefined,
  failure?: StreamFailure,
): void {
  sendFrame(ws, {
    type: "complete",
    topic,
    ...(id !== undefined && { id }),
    ...(failure && { error: failure }),
  });
}

/**
 * Refuse one frame about a subscription that goes on.
 *
 * @param ws - The socket
 * @param message - The frame refused
 * @param failure - Why
 * @example
 * ```ts
 * sendRefusal(ws, message, { code: 4404, message: "Not subscribed" });
 * ```
 */
export function sendRefusal(ws: NodeWebSocket, message: WSMessage, failure: StreamFailure): void {
  sendFrame(ws, {
    type: "error",
    ...(message.id !== undefined && { id: message.id }),
    ...(message.topic !== undefined && { topic: message.topic }),
    error: failure,
  });
}
