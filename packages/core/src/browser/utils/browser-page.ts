/**
 * Whether this code runs in a browser's page, as a page's bundle has it: a
 * page's own `window` and `document` are what the names find, before
 * anything code elsewhere gave `Object.prototype`. A bundler that builds for
 * the browser takes this module in place of the server's, which reads the
 * global object's own: a server has neither.
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
