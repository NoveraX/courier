import { HTTPError, ValidationError } from "@noverax/courier";
import { shownCause, shownText } from "@noverax/courier/internal";
import type { HttpResultChunk } from "./dispatch-http";

/** The status Courier's proxy answers a refused schema with. */
const VALIDATION_FAILED = 422;

/**
 * What the Playground is shown of a call that failed: its status, what
 * went wrong and the answer's body and headers. An error's text, and the
 * body of a request that got no answer — which holds that text and its
 * code — are cut as every error text Studio is told is: a header value
 * read with its line break fails with an error that quotes it, and the
 * app's own fetch may throw anything. An upstream's answer stays whole:
 * the Playground shows it as the response.
 *
 * @param err - What the call threw
 * @returns The result chunk
 * @example
 * ```ts
 * try { … } catch (err) { return playgroundFailure(err); }
 * ```
 */
export function playgroundFailure(err: unknown): HttpResultChunk {
  if (err instanceof ValidationError) {
    const { message, target, issues } = err;
    return {
      kind: "http-result",
      status: VALIDATION_FAILED,
      error: message,
      data: { success: false, message, target, issues },
    };
  }
  if (err instanceof HTTPError) {
    return {
      kind: "http-result",
      status: err.status,
      error: shownText(err.message),
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
