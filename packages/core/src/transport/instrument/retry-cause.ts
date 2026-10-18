import { platformCause } from "../../http-client/transport-failure";
import type { ConnectionRetry } from "../../realtime/retry-of";
import type { FailureCause } from "../../studio/failure-cause";
import { isRecord } from "../../utils/is-record";

/**
 * Why a stream's last connection ended, as Studio shows it beside the
 * reconnect: the system's code and text for a connection fetch could not
 * make, the status a server refused it with, a server that fell silent, the
 * close a socket reported — and the platform's text, where its error event
 * carried one. A browser's socket says no more than its close code: why it
 * failed is the browser's to keep.
 *
 * @param retry - What the client saw of the connection
 * @returns The cause
 * @example
 * ```ts
 * retryCause({ failures: 1, retryIn: 1000, error: fetchFailed });
 * // → { code: "ECONNREFUSED", message: "connect ECONNREFUSED 127.0.0.1:4010" }
 * retryCause({ failures: 3, retryIn: 4000, closed: { code: 1006, reason: "" }, opened: false });
 * // → { message: "The socket closed with code 1006 before it opened" }
 * ```
 */
export function retryCause(retry: ConnectionRetry): FailureCause {
  if (retry.silentFor !== undefined) {
    return { message: `No event or heartbeat came for ${retry.silentFor} ms` };
  }
  const said = errorCause(retry.error);
  if (said) return said;
  if (retry.closed) return { message: closedText(retry.closed, retry.opened) };
  return { message: "The connection closed before the stream ended" };
}

/* A refusal the client retries carries the status; an error event, the platform's error or text where it gave any. */
function errorCause(error: unknown): FailureCause | undefined {
  if (error instanceof Error) {
    const status: unknown = Reflect.get(error, "statusCode");
    if (typeof status === "number") {
      const reason: unknown = Reflect.get(error, "reason");
      return { message: typeof reason === "string" ? `${status} ${reason}`.trim() : `${status}` };
    }
    return saysAnything(error) ? platformCause(error) : undefined;
  }
  if (!isRecord(error)) return undefined;
  if (error.error instanceof Error && saysAnything(error.error)) return platformCause(error.error);
  return typeof error.message === "string" && error.message !== ""
    ? { message: error.message }
    : undefined;
}

/* Node's own WebSocket fails with an ErrorEvent whose TypeError says nothing at all. */
function saysAnything(error: Error): boolean {
  const cause = error.cause instanceof Error ? error.cause : error;
  return cause.message !== "" || ("code" in cause && typeof cause.code === "string");
}

function closedText(
  closed: NonNullable<ConnectionRetry["closed"]>,
  opened: boolean | undefined,
): string {
  const reason = closed.reason === "" ? "" : `: ${closed.reason}`;
  const when = opened === false ? " before it opened" : "";
  return `The socket closed with code ${closed.code}${when}${reason}`;
}
