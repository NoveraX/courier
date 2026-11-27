import { ConfigurationError } from "../../errors/configuration-error";
import type { PlatformFetch } from "../../http-client/source-transport";
import { answersWhole } from "../../utils/answers-whole";

/**
 * The fetch each connection of a stream goes with: the source's, else the
 * platform's, taken once, as the stream is subscribed to. One that hands an
 * answer over only once all of it has arrived — React Native's own, the
 * whatwg-fetch polyfill, which marks its fetch as a polyfill — is refused:
 * a stream's answer is never all there while the stream is open, so none of
 * its events would come, and each connection would be given up as one that
 * did not open in time, and made again, without end.
 *
 * @param given - The source's `fetch`, if it has one
 * @returns The fetch
 * @throws {ConfigurationError} `RESPONSE_STREAM_UNAVAILABLE`, for React Native's own fetch
 * @example
 * ```ts
 * const send = streamingFetch(options.fetch);
 * ```
 */
export function streamingFetch(given: PlatformFetch | undefined): PlatformFetch {
  const send = given ?? fetch;
  if (answersWhole(send)) throw unstreamed();
  return send;
}

/**
 * Why no stream can be read from an answer: it was handed over with no
 * body at all, as the polyfill hands over each of its answers — what a
 * fetch of the app's own that sends with React Native's shows itself by.
 * Whatever the answer says, a refusal too, no stream could be read with
 * that fetch, so the stream ends with this rather than being made again.
 *
 * @param response - The answer, its body unread
 * @returns The failure the stream ends with; `undefined` for an answer with a body to read
 * @example
 * ```ts
 * const unread = unstreamedAnswer(response);
 * if (unread) return unread;
 * ```
 */
export function unstreamedAnswer(response: Response): ConfigurationError | undefined {
  const body: unknown = response.body;
  return body === undefined ? unstreamed() : undefined;
}

function unstreamed(): ConfigurationError {
  return new ConfigurationError(
    "RESPONSE_STREAM_UNAVAILABLE",
    "A stream of server-sent events cannot be read with a fetch that hands an answer over only once all of it has arrived, as React Native's own does: none of its events would come while it is open. Open it with a fetch that streams, as `expo/fetch` does.",
  );
}
