import { randomBytes } from "node:crypto";

import { encodeMessage, type StreamFailure } from "@noverax/courier/internal";
import type { WebSocket as NodeWebSocket } from "ws";

/**
 * Send an error frame if the socket is still open. With a `topic` it
 * concerns that subscription, which goes on — the client's channel hears of
 * it; without one it is the connection's, and the client only logs it.
 */
export function sendError(ws: NodeWebSocket, failure: StreamFailure, topic?: string): void {
  if (ws.readyState !== ws.OPEN) return;
  ws.send(encodeMessage({ type: "error", ...(topic !== undefined && { topic }), error: failure }));
}

/**
 * Tell the client its subscription to `topic` ended — failed with `failure`,
 * or finished. The socket stays open, as a Courier server's does: a client
 * keeps one socket for the channels it reaches at an address, and the frame
 * names the topic, so that channel alone ends rather than retrying a close.
 *
 * @param ws - The socket the subscription was on
 * @param topic - The topic as the client subscribed to it
 * @param id - The id of the client's subscribe, when the subscription ends as it opens
 * @param failure - Why it ended, when it failed
 */
export function sendSubscriptionEnd(
  ws: NodeWebSocket,
  topic: string,
  id?: string,
  failure?: StreamFailure,
): void {
  if (ws.readyState !== ws.OPEN) return;
  ws.send(
    encodeMessage({
      type: "complete",
      topic,
      ...(id !== undefined && { id }),
      ...(failure && { error: failure }),
    }),
  );
}

/** Cryptographically random connection ID — 8 random bytes → 16 hex chars */
export function generateConnectionId(): string {
  return `mock_${randomBytes(8).toString("hex")}`;
}
