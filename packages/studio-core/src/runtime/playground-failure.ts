import { HTTPError, ValidationError } from "@noverax/courier";
import { shownCause, shownText } from "@noverax/courier/internal";
import { BROWSERS_ONLY_ADVICE, isBrowsersOnlyRefusal } from "./browsers-only-refusal";
import type { HttpResultChunk } from "./dispatch-http";
import { isRedirectStatus, redirectAdvice, upstreamRedirectAdvice } from "./proxy-redirect";

/** The status Courier's proxy answers a refused schema with. */
const VALIDATION_FAILED = 422;

/**
 * What the Playground is shown of a call that failed: its status, what
 * went wrong and the answer's body and headers. An error's text, and the
 * body of a request that got no answer — which holds that text and its
 * code — are cut as every error text Studio is told is: a header value
 * read with its line break fails with an error that quotes it, and the
 * app's own fetch may throw anything. An upstream's answer stays whole:
 * the Playground shows it as the response. A call `browsersOnly` refused
 * through the proxy is told why Studio's one-time pass did not carry it, and
 * one stopped at a redirect it did not follow is told why: the route's own
 * names where it points, its address cut as any other text, and the API's,
 * which the proxy answers with its status alone, names none.
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
  if (err instanceof ValidationError) {
    const { message, target, issues } = err;
    return {
      kind: "http-result",
      status: VALIDATION_FAILED,
      error: message,
      data: { success: false, message, target, issues },
    };
  }
  if (proxied && err instanceof HTTPError && isRedirectStatus(err.status)) {
    const location = err.headers.get("location");
    const error =
      location === null ? upstreamRedirectAdvice() : redirectAdvice(shownText(location));
    return {
      kind: "http-result",
      status: err.status,
      error,
      headers: Object.fromEntries(err.headers),
    };
  }
  if (err instanceof HTTPError) {
    const refused = proxied && isBrowsersOnlyRefusal(err.status, err.data);
    return {
      kind: "http-result",
      status: err.status,
      error: refused ? BROWSERS_ONLY_ADVICE : shownText(err.message),
      data: err.status === 0 ? unansweredBody(err.data) : err.data,
      headers: Object.fromEntries(err.headers),
    };
  }
  return {
    kind: "http-result",
    status: 500,
    error: err instanceof Error ? shownText(err.message) : "HTTP request failed",
  };
}

/* A request with no answer has no body of its own: what Courier gives it says why, and is cut as the cause is. */
function unansweredBody(data: unknown): Record<string, unknown> | undefined {
  const cause = shownCause(data);
  return cause && { success: false, ...cause };
}
