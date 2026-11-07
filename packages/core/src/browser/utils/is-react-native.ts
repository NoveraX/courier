/**
 * Whether this runtime is a React Native app, as a page's bundle has it:
 * never. A React Native app's bundler builds for the `react-native`
 * condition and takes the server's module, which reads the app's own
 * `navigator`; a bundler that builds for the browser takes this one.
 *
 * @returns `false`
 * @example
 * ```ts
 * const jar = isReactNative() ? learnedJar(address) : cookieJarOf(document.cookie);
 * ```
 */
export function isReactNative(): boolean {
  return false;
}
