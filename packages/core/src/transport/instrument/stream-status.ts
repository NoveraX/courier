import type { StreamStatusEvent } from "../../studio/hooks-stream";
import { retryCause } from "./retry-cause";
import type { Reconnect } from "./watch-connection";

/**
 * The event Studio is told a stream's connection status in: on
 * `reconnecting`, with whether the stream had opened before, how many
 * connections in a row failed, why the last one ended, and when the next
 * one opens.
 *
 * @param requestId - The stream's id
 * @param status - How its connection stands
 * @param reconnect - What the client saw, on `reconnecting`
 * @returns The event
 * @example
 * ```ts
 * streamStatusEvent("req_1", "reconnecting", { retry: { failures: 2, retryIn: 2000, error }, openedBefore: false });
 * // → { requestId: "req_1", status: "reconnecting", openedBefore: false, failures: 2, retryIn: 2000, cause: { code: "ECONNREFUSED", … }, timestamp }
 * ```
 */
export function streamStatusEvent(
  requestId: string,
  status: StreamStatusEvent["status"],
  reconnect?: Reconnect,
): StreamStatusEvent {
  const event: StreamStatusEvent = { requestId, status, timestamp: Date.now() };
  if (status !== "reconnecting" || reconnect === undefined) return event;
  const { retry, openedBefore } = reconnect;
  if (retry === undefined) return { ...event, openedBefore };
  return {
    ...event,
    openedBefore,
    failures: retry.failures,
    retryIn: retry.retryIn,
    cause: retryCause(retry),
  };
}
