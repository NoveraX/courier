/**
 * The check of `forward` where an API is defined, as a page's bundle has
 * it: none. A page serves no request whose headers `forward` could pass
 * on, so there it does nothing, and the server that shares the definition
 * checks it where it is defined. A bundler that builds for the browser
 * takes this module in place of that check.
 *
 * @param _forward - The `forward` the API was defined with
 * @param _where - The API, named in the error
 * @example
 * ```ts
 * assertForwardOptions({ requestId: "x-correlation-id" }, "api"); // checks nothing in a page
 * ```
 */
export function assertForwardOptions(_forward: unknown, _where: string): void {
  /* A page passes no request's headers on: there is nothing here to refuse. */
}
