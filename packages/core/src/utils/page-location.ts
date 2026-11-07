import { isRecord } from "./is-record";

/**
 * The address of the page the code runs on, where it has one: the
 * platform's own `location`, of the global object or of an object it stands
 * on, as a worker's is. A server's platform defines none, and the name finds
 * one that code elsewhere in the process gave `Object.prototype` — no page's.
 *
 * @returns The location, or `undefined` where there is no page
 * @example
 * ```ts
 * const origin = pageLocation()?.origin;
 * ```
 */
export function pageLocation(): Record<string, unknown> | undefined {
  const location: unknown = Reflect.get(globalThis, "location");
  return isRecord(location) && location !== Reflect.get(Object.prototype, "location")
    ? location
    : undefined;
}
