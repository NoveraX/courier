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
  if (typeof value !== "object" || value === null) return false;
  return typeof (value as { probe?: unknown }).probe === "function";
}

/**
 * Recover an endpoint's HTTP method and path template.
 *
 * A descriptor captured both when it was defined, so it answers directly
 * instead of running user code a second time.
 */
export function probeEndpoint(fn: unknown): ProbeResult {
  if (typeof fn === "object" && fn !== null) {
    const { method, path } = fn as { method?: string; path?: string };
    if (typeof method === "string") return { method, path: path || undefined };
  }
  return probeCallable(fn as (...args: unknown[]) => unknown);
}

function probeCallable(fn: (...args: unknown[]) => unknown): ProbeResult {
  let method: string | undefined;
  let path: string | undefined;

  const handler: ProxyHandler<object> = {
    get: (_target, prop) => {
      if (typeof prop === "string") method = prop;
      return (...args: unknown[]) => {
        if (typeof args[0] === "string") path = args[0];
        return Promise.resolve({});
      };
    },
  };

  const mockHttp = new Proxy({}, handler);

  try {
    fn(mockHttp, {});
  } catch {
    // Endpoint may throw during probing — method/path already captured
  }

  return {
    method: method || undefined,
    path: path || undefined,
  };
}

/**
 * Probes an endpoint function to capture just the path template.
 * @deprecated Use probeEndpoint() instead for both method and path.
 */
export function probeEndpointPath(fn: (...args: unknown[]) => unknown): string | undefined {
  return probeEndpoint(fn).path;
}
