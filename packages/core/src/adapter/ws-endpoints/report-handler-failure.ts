import { createLogger } from "../../logger";
import { RealtimeError } from "../../realtime/errors";
import { endpointName } from "../endpoint-name";
import type { WSSocketContext } from "../ws-context";
import { parseTopic } from "../ws-resolve";

const log = createLogger("WS");

/** How a failure is named in the log: as a refusal the handler meant, and as a fault. */
export interface FailureNames {
  /** The refusal's event: `"subscription refused"` */
  readonly refusal: string;
  /** What failed, for a fault: `"onJoin failed"` */
  readonly fault: string;
}

/**
 * Log what a channel or push handler threw. A `RealtimeError` is the handler
 * refusing on purpose — "not a member of this room" — and takes one line, as
 * every expected refusal does; anything else is a fault in the handler, and
 * is logged with its stack.
 *
 * @param ctx - The connection
 * @param topic - The topic the handler serves
 * @param error - What it threw
 * @param names - What the line calls it either way
 * @example
 * ```ts
 * reportHandlerFailure(ctx, topic, error, { refusal: "subscription refused", fault: "onJoin failed" });
 * ```
 */
export function reportHandlerFailure(
  ctx: WSSocketContext,
  topic: string,
  error: unknown,
  names: FailureNames,
): void {
  const endpoint = endpointName(parseTopic(topic));
  if (error instanceof RealtimeError) {
    const fields = { conn: ctx.connectionId, endpoint };
    ctx.refusals.warn({ event: names.refusal, code: error.code, fields }, error);
    return;
  }
  log.warn(`${names.fault} at ${endpoint}`, error);
}
