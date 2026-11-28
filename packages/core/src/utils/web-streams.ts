/**
 * Whether the platform has the web streams a body is read and passed
 * through with: `ReadableStream` and `TransformStream`. Every browser,
 * server and worker has them; React Native has none without Expo, whatever
 * fetch the app has.
 *
 * @returns Whether both are there
 * @example
 * ```ts
 * const mode = hasWebStreams() ? "stream" : "poll";
 * ```
 */
export function hasWebStreams(): boolean {
  return typeof ReadableStream === "function" && typeof TransformStream === "function";
}
