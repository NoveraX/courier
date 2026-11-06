/** An endpoint as a group or a source holds it: a descriptor carrying its wire closure. */
export interface EndpointEntry {
  readonly probe: (...args: never[]) => unknown;
}

/**
 * Recognise a value stored in a group or source as an endpoint.
 *
 * A descriptor keeps its wire closure under `probe`, so it is identified by
 * carrying one rather than by being callable itself.
 */
export const isEndpointEntry = (value: unknown): value is EndpointEntry =>
  typeof value === "object" &&
  value !== null &&
  "probe" in value &&
  typeof value.probe === "function";

/**
 * The endpoint a group or a source holds under a name, if it holds one there.
 *
 * @param target - The group or the source
 * @param name - The endpoint's name
 * @returns The endpoint, or `undefined`
 * @example
 * ```ts
 * getEndpoint(api, "getUsers")?.probe;
 * ```
 */
export const getEndpoint = (target: object, name: string): EndpointEntry | undefined => {
  const endpoint: unknown = Reflect.get(target, name);
  return isEndpointEntry(endpoint) ? endpoint : undefined;
};
