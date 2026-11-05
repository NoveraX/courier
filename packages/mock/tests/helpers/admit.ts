import {
  decodeMessage,
  encodeMessage,
  PROTOCOL_VERSION,
  type WSMessage,
} from "@noverax/courier/internal";
import type WebSocket from "ws";

/**
 * Let a test's socket in as a Courier client is let in: once it is open,
 * the `auth` frame of the protocol's version, and the `auth_ok` answering
 * it. What comes on the socket after is the test's.
 *
 * @param socket - The socket, opening or open
 * @param payload - What the `auth` frame carries: the headers and `auth` a client sends
 * @returns The `auth_ok`
 * @throws {Error} When the socket closes first, or the answer is another frame
 * @example
 * ```ts
 * const socket = new WebSocket(url);
 * await admit(socket);
 * socket.send(encodeMessage({ type: "subscribe", topic: "chat.room", id: "s1" }));
 * ```
 */
export async function admit(socket: WebSocket, payload: unknown = {}): Promise<WSMessage> {
  await new Promise<void>((resolve, reject) => {
    if (socket.readyState === socket.OPEN) return resolve();
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
  const answer = new Promise<WSMessage>((resolve, reject) => {
    const closed = (code: number) => reject(new Error(`The socket closed with ${code} first`));
    socket.once("close", closed);
    socket.once("message", (raw: Buffer | string) => {
      socket.off("close", closed);
      resolve(decodeMessage(raw.toString()));
    });
  });
  socket.send(encodeMessage({ type: "auth", v: PROTOCOL_VERSION, id: "a1", payload }));
  const frame = await answer;
  if (frame.type !== "auth_ok") throw new Error(`The auth frame was answered with ${frame.type}`);
  return frame;
}
