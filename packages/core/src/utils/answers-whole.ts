import type { PlatformFetch } from "../http-client/source-transport";

/**
 * Whether a fetch hands an answer over only once all of it has arrived:
 * React Native's own, the whatwg-fetch polyfill, which reads the answer
 * through XMLHttpRequest to its end, holds no stream of it, and marks its
 * fetch as a polyfill.
 *
 * @param send - The fetch
 * @returns Whether it is React Native's own
 * @example
 * ```ts
 * if (answersWhole(send)) throw unstreamed();
 * ```
 */
export function answersWhole(send: PlatformFetch): boolean {
  return (send as { polyfill?: unknown }).polyfill === true;
}

/**
 * Whether answers of `send`'s can be read as they come: not React Native's
 * own fetch's, nor any where the platform has no web streams to read one
 * through, as React Native without Expo has none, whatever fetch the app
 * has.
 *
 * @param send - The fetch
 * @returns Whether its answers can be read as they come
 * @example
 * ```ts
 * const mode = readsAsTheyCome(send) ? "stream" : "poll";
 * ```
 */
export function readsAsTheyCome(send: PlatformFetch): boolean {
  return (
    !answersWhole(send) &&
    typeof ReadableStream === "function" &&
    typeof TransformStream === "function"
  );
}
