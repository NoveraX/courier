import { logger } from "@noverax/courier";
import { decodeMessage, type WSMessage } from "@noverax/courier/internal";
import type { WebSocket as NodeWebSocket } from "ws";

import { sendError } from "./protocol";

/**
 * Decode a frame a client sent, answering one that is not a Courier frame
 * with an error frame.
 *
 * @param ws - The socket it came on
 * @param raw - The frame
 * @returns The message, or `null` for a frame that is none
 * @example
 * ```ts
 * ws.on("message", (raw) => { const message = parseMessage(ws, raw); });
 * ```
 */
export function parseMessage(ws: NodeWebSocket, raw: Buffer | string): WSMessage | null {
  try {
    return decodeMessage(raw.toString());
  } catch (error) {
    logger.warn("MockWS", "Undecodable frame", error);
    sendError(ws, { code: 4400, message: "Invalid message" });
    return null;
  }
}
