import { frameCredentials, frameHeadersOver, type WSMessage } from "@noverax/courier/internal";
import type { ChannelSocket } from "./types";

/**
 * The headers of a client's `auth` frame over its handshake's, as a Courier
 * server reads them: none the handshake has, and none only a browser or a
 * proxy sets. The subscriptions made from then on call their mocks with
 * them, so a mock reads the `Authorization` a browser could only send in
 * the frame. A later frame replaces what an earlier one added.
 *
 * @param socket - The socket the frame came on
 * @param message - The `auth` frame
 * @returns The headers, or nothing for a frame no client sends
 * @example
 * ```ts
 * frameHeaders(socket, { type: "auth", payload: { headers: { authorization: "Bearer t1" } } });
 * ```
 */
export function frameHeaders(socket: ChannelSocket, message: WSMessage): Headers | undefined {
  const credentials = frameCredentials(message.payload);
  return credentials && frameHeadersOver(socket.handshake, credentials);
}
