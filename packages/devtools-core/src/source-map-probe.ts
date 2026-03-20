/** Result of probing an endpoint function */
export interface ProbeResult {
  /** HTTP method (get, post, put, patch, del) */
  method?: string;
  /** Path template (e.g. ":id") */
  path?: string;
}

/**
 * Probes an endpoint function with a mock http client to capture
 * the HTTP method and path template (e.g. ":id") passed to http.get/post/etc.
 */
export function probeEndpoint(fn: (...args: unknown[]) => unknown): ProbeResult {
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
