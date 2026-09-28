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
 * Tell the client the subscription to `topic` ended — failed with `failure`,
 * or finished — then close the socket once that frame is on the wire.
 *
 * A mock channel has a socket of its own, so its end is the socket's. It
 * used to send an error the client could not match to its channel and close
 * with 1011, which the client retried — and the failure repeated — forever.
 */
export function endSubscriptionAndClose(
  ws: NodeWebSocket,
  topic: string,
  failure?: StreamFailure,
): void {
  if (ws.readyState !== ws.OPEN) return;
  const frame = encodeMessage({ type: "complete", topic, ...(failure && { error: failure }) });
  ws.send(frame, () => {
    if (ws.readyState === ws.OPEN) ws.close(1000, "subscription ended");
  });
}

/** Cryptographically random connection ID — 8 random bytes → 16 hex chars */
export function generateConnectionId(): string {
  return `mock_${randomBytes(8).toString("hex")}`;
}
