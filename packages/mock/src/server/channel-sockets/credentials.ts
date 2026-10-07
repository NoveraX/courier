import { logger } from "@noverax/courier";
import { frameCredentials, frameHeadersOver, type WSMessage } from "@noverax/courier/internal";
import { sendFrame } from "./frames";
import type { ChannelSocket } from "./types";

/**
 * Take the headers of a client's `auth` frame as its handshake's, as a
 * Courier server does: none the handshake has, and none only a browser or a
 * proxy sets. The subscriptions made from then on call their mocks with
 * them, so a mock reads the `Authorization` a browser could only send in the
 * frame. A later frame replaces what an earlier one added.
 *
 * @param socket - The socket the frame came on
 * @param message - The `auth` frame
 * @example
 * ```ts
 * takeAuthFrame(socket, { type: "auth", payload: { headers: { authorization: "Bearer t1" } } });
 * ```
 */
export function takeAuthFrame(socket: ChannelSocket, message: WSMessage): void {
  const credentials = frameCredentials(message.payload);
  const headers = credentials && frameHeadersOver(socket.handshake, credentials);
  if (headers === undefined) {
    logger.warn("MockWS", `An auth frame no client sends was ignored (${socket.id})`);
    const id = message.id !== undefined ? { id: message.id } : {};
    sendFrame(socket.ws, {
      type: "error",
      ...id,
      error: { code: 4400, message: "Invalid auth frame" },
    });
    return;
  }
  socket.headers = headers;
}
