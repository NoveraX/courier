import { HTTPError, NetworkError, TimeoutError } from "../errors";
import { isUnrepeatable } from "../utils/unrepeatable";
import type { MiddlewareResponse, RetryFailure } from "./types";

/** How one attempt ended: with an answer, or with the error it was rejected with. */
export type Attempt = { readonly response: MiddlewareResponse } | { readonly error: unknown };

/**
 * Why an attempt failed, as a retry policy judges it.
 *
 * An answer that was not a success fails the call as an `HTTPError` — or a
 * middleware further in returned it — and is judged by its status, body and
 * headers. A request that got no answer, and one whose own time ran out,
 * are judged by what happened. Anything else — a success, an answer that
 * failed its schema, a middleware that threw, a deadline that ran out, a
 * redirect an upload cannot follow — is no failure a retry could mend.
 *
 * @param outcome - How the attempt ended
 * @returns Why it failed, or `undefined` when there is nothing to retry
 * @example
 * ```ts
 * failureOf({ error: new NetworkError({ systemCode: "ECONNRESET" }) }); // { kind: "network", error }
 * ```
 */
export function failureOf(outcome: Attempt): RetryFailure | undefined {
  if ("response" in outcome) {
    const { status, data, headers } = outcome.response;
    return status >= 200 && status <= 299 ? undefined : { kind: "status", status, data, headers };
  }
  const { error } = outcome;
  if (isUnrepeatable(error)) return undefined;
  if (error instanceof HTTPError) {
    return { kind: "status", status: error.status, data: error.data, headers: error.headers };
  }
  if (error instanceof NetworkError) return { kind: "network", error };
  if (error instanceof TimeoutError && error.scope === "attempt") return { kind: "timeout", error };
  return undefined;
}
