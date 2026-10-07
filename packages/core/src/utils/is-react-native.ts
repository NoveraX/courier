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
  const navigator: unknown = Reflect.get(globalThis, "navigator");
  return (
    typeof navigator === "object" &&
    navigator !== null &&
    Reflect.get(navigator, "product") === "ReactNative"
  );
}
