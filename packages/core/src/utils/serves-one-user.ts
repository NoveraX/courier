/**
 * Whether this runtime serves one user: a browser, or a React Native app,
 * which has no `document` but sets `navigator.product` to `"ReactNative"`.
 * A server serves many, so what one caller does must not touch another's
 * calls there.
 *
 * @returns `true` in a browser or a React Native app
 * @example
 * ```ts
 * const dedupes = servesOneUser() && kind === "query";
 * ```
 */
export function servesOneUser(): boolean {
  if (Reflect.get(globalThis, "document") !== undefined) return true;
  const navigator: unknown = Reflect.get(globalThis, "navigator");
  return (
    typeof navigator === "object" &&
    navigator !== null &&
    Reflect.get(navigator, "product") === "ReactNative"
  );
}
