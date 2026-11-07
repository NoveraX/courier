/**
 * Whether this runtime is a React Native app, which has no `document` and
 * sets `navigator.product` to `"ReactNative"`.
 *
 * @returns `true` in a React Native app
 * @example
 * ```ts
 * const jar = isReactNative() ? learnedJar(address) : cookieJarOf(document.cookie);
 * ```
 */
export function isReactNative(): boolean {
  /* React Native's navigator and its product are its own: what Object.prototype holds is a server's. */
  const navigator: unknown = Object.hasOwn(globalThis, "navigator")
    ? Reflect.get(globalThis, "navigator")
    : undefined;
  return (
    typeof navigator === "object" &&
    navigator !== null &&
    Object.hasOwn(navigator, "product") &&
    Reflect.get(navigator, "product") === "ReactNative"
  );
}
