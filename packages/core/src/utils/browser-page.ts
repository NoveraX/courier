/**
 * Whether this code runs in a browser's page, whose `fetch` follows a
 * redirect itself, keeping a request's credentials to the page's own rules,
 * and answers one it is told to leave alone opaquely: status `0`, with no
 * address to follow.
 *
 * @returns `true` where there is a `window` and a `document`
 * @example
 * ```ts
 * if (inBrowserPage()) return send(url, init);
 * ```
 */
export function inBrowserPage(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}
