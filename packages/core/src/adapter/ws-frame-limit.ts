import { LIMITS } from "../limits";

/** The largest WebSocket message, in bytes, a handler accepts unless told otherwise. */
export const DEFAULT_WS_MAX_MESSAGE_SIZE: number = LIMITS.MAX_MESSAGE_SIZE;

/** The frame limit when the message limit is no more than half of it (1 MiB). */
const DEFAULT_WS_FRAME_LIMIT = 1_048_576;

/**
 * The largest WebSocket frame to read at all, for a handler that accepts
 * messages up to `maxMessageSize`; `ws` closes the connection with 1009 on a
 * bigger one, before buffering it.
 *
 * It sits well above the message limit — 1 MiB, or twice `maxMessageSize`
 * when that is larger — so a message over that limit reaches the handler,
 * which refuses the one message with a 4413 error on a connection that stays
 * open, rather than closing the socket and every subscription on it.
 *
 * @param maxMessageSize - The handler's message limit, in bytes (default 64 KB)
 * @returns The frame limit in bytes
 *
 * @example
 * ```ts
 * wsFrameLimit(); // 1_048_576
 * wsFrameLimit(4_194_304); // 8_388_608
 * ```
 */
export function wsFrameLimit(maxMessageSize: number = DEFAULT_WS_MAX_MESSAGE_SIZE): number {
  return Math.max(DEFAULT_WS_FRAME_LIMIT, 2 * maxMessageSize);
}
