/** Result of probing an endpoint function */
export interface ProbeResult {
  /** HTTP method (get, post, put, patch, del) */
  method?: string;
  /** Path template (e.g. ":id") */
  path?: string;
  /** Whether the process that defines it serves it: a stream or a channel it implements. */
  served?: true;
}

/**
 * Recognise a value held by a source or group as an endpoint.
 *
 * A descriptor is identified by the wire closure it carries rather than by
 * being callable itself.
 */
export function isEndpoint(value: unknown): boolean {
  return (
    typeof value === "object" && value !== null && typeof Reflect.get(value, "probe") === "function"
  );
}

/**
 * Recover an endpoint's HTTP method and path template, and whether the
 * process that defines it serves it.
 *
 * A descriptor captured them when it was defined, so it answers directly
 * instead of running user code a second time.
 *
 * @param fn - The value a source or a group holds
 * @returns Its method and path, and `served` when its process serves it
 * @example
 * ```ts
 * probeEndpoint(api.live.chat); // → { method: "get", served: true }
 * ```
 */
export function probeEndpoint(fn: unknown): ProbeResult {
  if (typeof fn !== "object" || fn === null) return {};
  const method: unknown = Reflect.get(fn, "method");
  const path: unknown = Reflect.get(fn, "path");
  if (typeof method !== "string") return {};
  return {
    method,
    ...(typeof path === "string" && path !== "" && { path }),
    ...(Reflect.get(fn, "served") === true && { served: true as const }),
  };
}
