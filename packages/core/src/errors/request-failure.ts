import { HTTPError } from "./http-error";
import { NetworkError } from "./network-error";
import { TimeoutError } from "./timeout-error";

/**
 * A call that ended without a successful answer: its upstream refused it
 * (`HTTPError`), no answer came (`NetworkError`), or its time ran out
 * (`TimeoutError`). A cancellation, a schema the answer failed or a mistake
 * in the call is none of these.
 */
export type RequestFailure = HTTPError | NetworkError | TimeoutError;

/**
 * Type guard for {@link RequestFailure}.
 *
 * @param error - What a call rejected with
 * @returns Whether the call got no successful answer
 * @example
 * ```ts
 * if (isRequestFailure(error)) report(error.code); // "HTTP_ERROR", "NETWORK_ERROR" or "TIMEOUT"
 * ```
 */
export function isRequestFailure(error: unknown): error is RequestFailure {
  return (
    error instanceof HTTPError || error instanceof NetworkError || error instanceof TimeoutError
  );
}
