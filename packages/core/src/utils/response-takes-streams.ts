import { hasWebStreams } from "./web-streams";

/**
 * Whether the platform makes a `Response` of a stream: its `Response` is
 * made of one, as a server's and a worker's are, and the web streams to
 * make one of are there — Node's `Response` knows a stream by the global
 * `ReadableStream`, and fails to take one without it. React Native's is
 * the whatwg-fetch polyfill, which has no `body` and holds a stream as the
 * text `[object ReadableStream]`, and without Expo React Native has no
 * streams at all. Code a page never runs: a bundler that builds for the
 * browser takes a stand-in that answers yes.
 *
 * @returns Whether a `Response` can be made of a body to read
 * @example
 * ```ts
 * if (responseTakesStreams()) return new Response(stream).text();
 * ```
 */
export function responseTakesStreams(): boolean {
  return "body" in Response.prototype && hasWebStreams();
}
