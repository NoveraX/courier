/**
 * Whether the platform has the web streams a body is read and passed on
 * with: `ReadableStream`, whose reader every implementation has alike.
 * Every browser, server and worker has it; React Native has none without
 * Expo, whatever fetch the app has.
 *
 * @returns Whether it is there
 * @example
 * ```ts
 * const mode = hasWebStreams() ? "stream" : "poll";
 * ```
 */
export function hasWebStreams(): boolean {
  return typeof ReadableStream === "function";
}
