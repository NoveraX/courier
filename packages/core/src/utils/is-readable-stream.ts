/**
 * Whether a value is a web stream to read, whichever implementation of web
 * streams made it: the platform's, or a polyfill's set as the global class
 * — as jest-expo sets the one Metro puts in a React Native app, while the
 * bodies of Node's fetch stay Node's streams. A stream is told by what it
 * says it is, as every implementation names its class, rather than as an
 * instance of the global class, which React Native has none of without
 * Expo.
 *
 * @param value - Anything
 * @returns Whether it is a `ReadableStream`
 * @example
 * ```ts
 * isReadableStream(new Response("x").body); // → true
 * isReadableStream({ getReader() {} }); // → false
 * ```
 */
export function isReadableStream(value: unknown): value is ReadableStream {
  return Object.prototype.toString.call(value) === "[object ReadableStream]";
}
