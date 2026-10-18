import { HTTPError, ValidationError } from "@noverax/courier";

import { unansweredBody } from "../events/unanswered-body";
import { boundedText } from "./bounded-text";
import { BROWSERS_ONLY_ADVICE, isBrowsersOnlyRefusal } from "./browsers-only-refusal";
import type { HttpResultChunk } from "./dispatch-http";
import { isRedirectStatus, redirectAdvice, upstreamRedirectAdvice } from "./proxy-redirect";

/** The status Courier's proxy answers a refused schema with. */
const VALIDATION_FAILED = 422;

/**
 * What the Playground is shown of a call that failed: its status, what
 * went wrong and the answer's body and headers, as the app was told them —
 * the Playground runs on the page that holds Studio's token, and Studio
 * cuts what leaves it. A request that got no answer keeps the body Courier
 * gives it, its cause, and no more. A call `browsersOnly` refused through
 * the proxy is told why Studio's one-time pass did not carry it, and one
 * stopped at a redirect it did not follow is told why: the route's own
 * names where it points, and the API's, which the proxy answers with its
 * status alone, names none.
 *
 * @param err - What the call threw
 * @param proxied - Whether the call went through the app's proxy route
 * @returns The result chunk
 * @example
 * ```ts
 * try { … } catch (err) { return playgroundFailure(err, payload.mode === "proxy"); }
 * ```
 */
export function playgroundFailure(err: unknown, proxied = false): HttpResultChunk {
  if (err instanceof ValidationError) return refusedVariables(err);
  if (proxied && err instanceof HTTPError && isRedirectStatus(err.status)) {
    return stoppedRedirect(err);
  }
  if (err instanceof HTTPError) return failedCall(err, proxied);
  return {
    kind: "http-result",
    status: 500,
    error: err instanceof Error ? boundedText(err.message) : "HTTP request failed",
  };
}

function refusedVariables({ message, target, issues }: ValidationError): HttpResultChunk {
  return {
    kind: "http-result",
    status: VALIDATION_FAILED,
    error: message,
    data: { success: false, message, target, issues },
  };
}

/* The route's own redirect names where it points; the API's, which the proxy answers with its status alone, names none. */
function stoppedRedirect(err: HTTPError): HttpResultChunk {
  const location = err.headers.get("location");
  const error =
    location === null ? upstreamRedirectAdvice() : redirectAdvice(boundedText(location));
  return {
    kind: "http-result",
    status: err.status,
    error,
    headers: Object.fromEntries(err.headers),
  };
}

function failedCall(err: HTTPError, proxied: boolean): HttpResultChunk {
  const refused = proxied && isBrowsersOnlyRefusal(err.status, err.data);
  return {
    kind: "http-result",
    status: err.status,
    error: refused ? BROWSERS_ONLY_ADVICE : boundedText(err.message),
    data: err.status === 0 ? unansweredBody(err.data) : err.data,
    headers: Object.fromEntries(err.headers),
  };
}
