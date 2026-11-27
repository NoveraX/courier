import { ConfigurationError } from "../errors/configuration-error";
import { isBodilessStatus } from "../http-client/response";
import type { PlatformFetch } from "../http-client/source-transport";

/**
 * Refuse a call that reads its answer as it comes before it is sent with a
 * fetch that hands an answer over only once all of it has arrived: React
 * Native's own, the whatwg-fetch polyfill, which reads the answer through
 * XMLHttpRequest to its end and holds no stream of it, and marks its fetch
 * as a polyfill. Refused, the call does nothing its caller cannot read as
 * asked, and one whose answer never ends does not wait for that end.
 *
 * @param send - The fetch the call goes with
 * @throws {ConfigurationError} `RESPONSE_STREAM_UNAVAILABLE`, for React Native's own fetch
 * @example
 * ```ts
 * if (streamed) assertStreamingFetch(transport ?? send);
 * ```
 */
export function assertStreamingFetch(send: PlatformFetch): void {
  if ((send as { polyfill?: unknown }).polyfill === true) throw unstreamed();
}

/**
 * Refuse an answer a call reads as it comes that was handed over with no
 * stream at all — no `body`, as the polyfill's has none — unless its
 * status has no body: what a fetch of the app's own that sends with React
 * Native's hands over, which the answer alone tells.
 *
 * @param response - The answer, its body unread
 * @throws {ConfigurationError} `RESPONSE_STREAM_UNAVAILABLE`, for an answer handed over whole
 * @example
 * ```ts
 * assertStreamedAnswer(response);
 * const body = response.body;
 * ```
 */
export function assertStreamedAnswer(response: Response): void {
  const body: unknown = response.body;
  if (body === undefined && !isBodilessStatus(response.status)) throw unstreamed();
}

function unstreamed(): ConfigurationError {
  return new ConfigurationError(
    "RESPONSE_STREAM_UNAVAILABLE",
    "A call that reads its answer as it comes, with `stream: true`, cannot go with a fetch that hands an answer over only once all of it has arrived, as React Native's own does. Read the answer whole, without `stream`, or send the call with a fetch that streams, as `expo/fetch` does.",
  );
}
