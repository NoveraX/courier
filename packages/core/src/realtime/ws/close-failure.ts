import type { ScopedLogger } from "../../logger";
import { fromErrorCode, type RealtimeError } from "../errors";
import type { TopicRegistry } from "./topic-registry-types";
import type { WSCloseEventLike } from "./ws-types";

/** The close code of a socket closed over a frame larger than the server reads. */
export const MESSAGE_TOO_BIG = 1009;

/**
 * The server closed the socket over one message larger than it reads. That
 * message is gone and the rest may go on, so the connection reconnects
 * rather than ending every subscription on it, and each subscription hears
 * why its socket closed under it.
 *
 * @param topics - The connection's subscriptions
 * @param log - Where the connection logs
 * @param ev - How the socket closed
 * @example
 * ```ts
 * if (ev.code === MESSAGE_TOO_BIG) tellOfOversizedMessage(ctx.topics, ctx.log, ev);
 * ```
 */
export function tellOfOversizedMessage(
  topics: TopicRegistry,
  log: ScopedLogger,
  ev: WSCloseEventLike,
): void {
  const error = fromErrorCode(
    MESSAGE_TOO_BIG,
    ev.reason || "A message was too large for the server",
  );
  log.warn(`The server closed the connection over a message too large: ${error.message}`);
  for (const topic of topics.topics()) topics.fail(topic, error);
}

/**
 * Why a socket closed for good, as its subscriptions read it.
 *
 * @param ev - How the socket closed
 * @returns The error each subscription ends with; none for a normal close
 * @example
 * ```ts
 * ctx.topics.endAll(closeFailure({ code: 4401, reason: "Connection rejected" }));
 * ```
 */
export function closeFailure(ev: WSCloseEventLike): RealtimeError | undefined {
  if (ev.code === 1000) return undefined;
  return fromErrorCode(ev.code, ev.reason || "Connection closed");
}
