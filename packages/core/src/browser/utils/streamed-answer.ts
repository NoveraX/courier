import type { PlatformFetch } from "../../http-client/source-transport";

/**
 * Refuse a call that reads its answer as it comes where its fetch cannot
 * hand one over so, as a page's bundle has it: never, as every fetch a page
 * has hands its answer over as it arrives. Only React Native's own fetch,
 * the whatwg-fetch polyfill, cannot, and the app's bundler builds for the
 * `react-native` condition and takes the server's module, which refuses
 * it; a bundler that builds for the browser takes this one.
 *
 * @param _send - The fetch the call goes with
 * @example
 * ```ts
 * if (streamed) assertStreamingFetch(transport ?? send);
 * ```
 */
export function assertStreamingFetch(_send: PlatformFetch): void {}

/**
 * Refuse an answer handed over with no stream at all, as a page's bundle
 * has it: never, as no fetch a page has hands one over so.
 *
 * @param _response - The answer
 * @example
 * ```ts
 * assertStreamedAnswer(response);
 * const body = response.body;
 * ```
 */
export function assertStreamedAnswer(_response: Response): void {}
