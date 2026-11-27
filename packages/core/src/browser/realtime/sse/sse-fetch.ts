import type { ConfigurationError } from "../../../errors/configuration-error";
import type { PlatformFetch } from "../../../http-client/source-transport";

/**
 * The fetch each connection of a stream goes with, as a page's bundle has
 * it: the source's, else the page's, taken once, as the stream is
 * subscribed to — never refused, as every fetch a page has hands an answer
 * over as it arrives. Only React Native's own fetch cannot, and the app's
 * bundler builds for the `react-native` condition and takes the server's
 * module, which refuses it; a bundler that builds for the browser takes
 * this one.
 *
 * @param given - The source's `fetch`, if it has one
 * @returns The fetch
 * @example
 * ```ts
 * const send = streamingFetch(options.fetch);
 * ```
 */
export function streamingFetch(given: PlatformFetch | undefined): PlatformFetch {
  return given ?? fetch;
}

/**
 * Why no stream can be read from an answer, as a page's bundle has it:
 * never a reason, as no fetch a page has hands an answer over with no body.
 *
 * @param _response - The answer
 * @returns `undefined`
 * @example
 * ```ts
 * const unread = unstreamedAnswer(response);
 * if (unread) return unread;
 * ```
 */
export function unstreamedAnswer(_response: Response): ConfigurationError | undefined {
  return undefined;
}
