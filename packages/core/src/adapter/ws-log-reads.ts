import type { RefusalLog } from "../logger/refusal-log";
import type { LoggedEvent } from "../realtime/adapters";
import { withinDeadline } from "../utils/within-deadline";
import { LIMITS } from "./limits";
import type { TopicPosition } from "./ws-topic-sequences";

/**
 * What a topic log answered within `WS_LOG_TIMEOUT_MS`, or undefined for
 * one that failed or did not answer in time — said in the refusal log, once
 * an interval, and gone on without.
 *
 * @param promise - The log's answer
 * @param refusals - The handler's log of refusals
 * @returns The answer, or undefined
 * @example
 * ```ts
 * const position = await askLog(log.position(topic), refusals);
 * ```
 */
export async function askLog<T>(promise: Promise<T>, refusals: RefusalLog): Promise<T | undefined> {
  try {
    return await withinDeadline(promise, LIMITS.WS_LOG_TIMEOUT_MS);
  } catch (error) {
    refusals.warn({ event: "topic log not read", code: "LOG_UNAVAILABLE" }, error);
    return undefined;
  }
}

/**
 * Whether a log's read sent back every event after `from` up to `upTo`, in
 * order and in `from`'s epoch — what it owes — rather than trust an adapter
 * with a gap in it.
 *
 * @param events - What the log sent back
 * @param from - The position read after
 * @param upTo - The last number read
 * @returns Whether they are all there
 * @example
 * ```ts
 * if (events && wholeRange(events, from, upTo)) for (const event of events) send(event);
 * ```
 */
export function wholeRange(
  events: readonly LoggedEvent[],
  from: TopicPosition,
  upTo: number,
): boolean {
  if (events.length !== upTo - from.seq) return false;
  return events.every((event, i) => event.seq === from.seq + 1 + i && event.epoch === from.epoch);
}
