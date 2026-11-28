/**
 * Whether the platform makes a `Response` of a stream, as a page's bundle
 * has it: yes, as every browser Courier runs in has a `Response` made of
 * one and the web streams to make one of. Only React Native's `Response`,
 * the whatwg-fetch polyfill, is made of none, and the app's bundler builds
 * for the `react-native` condition and takes the server's module, which
 * asks; a bundler that builds for the browser takes this one.
 *
 * @returns `true`
 * @example
 * ```ts
 * if (responseTakesStreams()) return new Response(stream).text();
 * ```
 */
export function responseTakesStreams(): true {
  return true;
}
