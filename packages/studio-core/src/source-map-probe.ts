/** Result of probing an endpoint function */
export interface ProbeResult {
  /** HTTP method (get, post, put, patch, del) */
  method?: string;
  /** Path template (e.g. ":id") */
  path?: string;
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
 * Recover an endpoint's HTTP method and path template.
 *
 * A descriptor captured both when it was defined, so it answers directly
 * instead of running user code a second time.
 */
export function probeEndpoint(fn: unknown): ProbeResult {
  if (typeof fn !== "object" || fn === null) return {};
  const method: unknown = Reflect.get(fn, "method");
  const path: unknown = Reflect.get(fn, "path");
  if (typeof method !== "string") return {};
  return { method, path: typeof path === "string" && path !== "" ? path : undefined };
}
