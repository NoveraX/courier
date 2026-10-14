const APPLE = /mac|iphone|ipad|ipod/i;

/**
 * Whether the page runs on a Mac, an iPhone or an iPad, whose keyboards
 * mark the modifier keys with symbols — ⌘ where others write Ctrl. An
 * iPad's Safari reports itself as a Mac, which its keyboard is.
 *
 * @returns Whether it does
 * @example
 * ```ts
 * isApplePlatform(); // → true in Safari on a Mac, false in Chrome on Windows
 * ```
 */
export function isApplePlatform(): boolean {
  const hints: unknown = Reflect.get(navigator, "userAgentData");
  const reported: unknown =
    typeof hints === "object" && hints !== null ? Reflect.get(hints, "platform") : undefined;
  const platform = typeof reported === "string" && reported !== "" ? reported : navigator.platform;
  return APPLE.test(platform);
}
