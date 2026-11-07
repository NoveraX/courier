/**
 * The address of the page the code runs on, as a page's bundle has it: the
 * page's own `location`, or a worker's, which the name finds before anything
 * code elsewhere gave `Object.prototype`, and whose fields the caller reads
 * for what they are. A bundler that builds for the browser takes this
 * module in place of the server's, which tells a location `Object.prototype`
 * holds from the platform's own.
 *
 * @returns The location, or `undefined` where there is none
 * @example
 * ```ts
 * const origin = pageLocation()?.origin;
 * ```
 */
export function pageLocation(): Record<string, unknown> | undefined {
  const location: unknown = Reflect.get(globalThis, "location");
  return location as Record<string, unknown> | undefined;
}
