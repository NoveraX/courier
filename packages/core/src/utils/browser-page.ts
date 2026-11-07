/**
 * Whether this code runs in a browser's page, whose `fetch` follows a
 * redirect itself, keeping a request's credentials to the page's own rules,
 * and answers one it is told to leave alone opaquely: status `0`, with no
 * address to follow.
 *
 * @returns `true` where the global object has a `window` and a `document` of
 *   its own, as a page's has; a server has neither, whatever
 *   `Object.prototype` holds — the name of a global finds that too
 * @example
 * ```ts
 * if (inBrowserPage()) return send(url, init);
 * ```
 */
export function inBrowserPage(): boolean {
  return Object.hasOwn(globalThis, "window") && Object.hasOwn(globalThis, "document");
}
