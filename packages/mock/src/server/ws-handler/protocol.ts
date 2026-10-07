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

/** Cryptographically random connection ID — 8 random bytes → 16 hex chars */
export function generateConnectionId(): string {
  return `mock_${randomBytes(8).toString("hex")}`;
}
