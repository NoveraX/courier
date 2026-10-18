import { readCause } from "@noverax/courier-studio-core";
import { num, optNum } from "./event-helpers";
import type { RequestEntry, StreamConnection } from "./types";

type EventPayload = Record<string, unknown>;

const STATUSES: ReadonlySet<unknown> = new Set(["connecting", "open", "reconnecting"]);

/**
 * How a stream's connection stands, as its runtime told it: being opened,
 * open, or being opened again — with how many connections in a row failed,
 * why the last one ended and when the next one opens. A stream that has
 * ended keeps how it stood as it ended; a status in another shape changes
 * nothing.
 *
 * @param r - The stream
 * @param event - Its `stream:status` event
 * @returns The stream, its connection as it now stands
 * @example
 * ```ts
 * withStreamStatus(stream, { status: "reconnecting", failures: 2, retryIn: 2000, cause, timestamp: 9_000 })
 *   .streamConnection; // → { status: "reconnecting", failures: 2, retryAt: 11_000, cause, since: 9_000, openedBefore: false }
 * ```
 */
export function withStreamStatus(r: RequestEntry, event: EventPayload): RequestEntry {
  if (r.streamStatus === "complete" || r.streamStatus === "error") return r;
  const { status } = event;
  if (!STATUSES.has(status)) return r;
  const told = status as StreamConnection["status"];
  const at = num(event.timestamp, Date.now());
  const before = r.streamConnection;
  const since = before?.status === told ? before.since : at;
  const openedBefore =
    told === "open" || event.openedBefore === true || before?.openedBefore === true;
  if (told !== "reconnecting")
    return { ...r, streamConnection: { status: told, since, openedBefore } };
  const failures = optNum(event.failures);
  const retryIn = optNum(event.retryIn);
  const cause = readCause(event.cause);
  const connection: StreamConnection = {
    status: told,
    since,
    openedBefore,
    ...(failures !== undefined && { failures }),
    ...(cause && { cause }),
    ...(retryIn !== undefined && { retryAt: at + retryIn }),
  };
  return { ...r, streamConnection: connection };
}
