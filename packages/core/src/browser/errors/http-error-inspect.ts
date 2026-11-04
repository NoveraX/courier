import type { HTTPError } from "../../errors/http-error";

/**
 * How an `HTTPError` prints, as a page's bundle has it: as the browser's
 * console prints any error, which reads no hook of Node's. A bundler that
 * builds for the browser takes this module in place of the one that gives
 * Node its hook, and the hiding of each credential header's value with it.
 *
 * @param _prototype - `HTTPError.prototype`
 * @example
 * ```ts
 * defineNodePrinting(HTTPError.prototype); // gives it nothing
 * ```
 */
export function defineNodePrinting(_prototype: HTTPError): void {
  /* A page's console prints an error by its own rules. */
}
