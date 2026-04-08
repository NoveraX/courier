import { randomBytes } from "node:crypto";

import { encodeMessage } from "@noverax/nexus/realtime";
import type { WebSocket as NodeWebSocket } from "ws";

/** Send a typed error frame to a client if the socket is still open */
export function sendError(ws: NodeWebSocket, code: number, message: string): void {
  if (ws.readyState !== ws.OPEN) return;
  ws.send(encodeMessage({ type: "error", error: { code, message } }));
}

/**
 * Send an error frame, then close the socket — but only **after** the
 * error frame has been flushed to the wire. This prevents a race where
 * `ws.close()` discards the queued send buffer and the client never sees
 * the error reason.
 */
export function sendErrorAndClose(
  ws: NodeWebSocket,
  errorCode: number,
  message: string,
  closeCode = 1011,
): void {
  if (ws.readyState !== ws.OPEN) return;
  ws.send(encodeMessage({ type: "error", error: { code: errorCode, message } }), (err) => {
    // Whether or not the send succeeded, proceed with the close — the
    // connection is in a broken state and must not stay open.
    void err;
    if (ws.readyState === ws.OPEN) {
      ws.close(closeCode, message);
    }
  });
}

/** Extract a human-readable message from an unknown error value */
export function errMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/** Cryptographically random connection ID — 8 random bytes → 16 hex chars */
export function generateConnectionId(): string {
  return `mock_${randomBytes(8).toString("hex")}`;
}
