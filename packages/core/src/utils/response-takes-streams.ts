/**
 * Whether the platform's `Response` is made of a stream, as a browser's, a
 * server's and a worker's are. React Native's is the whatwg-fetch polyfill,
 * which has no `body` and holds a stream as the text `[object
 * ReadableStream]`.
 *
 * @returns Whether a `Response` can be made of a body to read
 * @example
 * ```ts
 * if (responseTakesStreams()) return new Response(stream).text();
 * ```
 */
export function responseTakesStreams(): boolean {
  return "body" in Response.prototype;
}
