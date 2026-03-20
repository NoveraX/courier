/**
 * Probes an endpoint function with a mock http client to capture
 * the path template (e.g. ":id") passed to http.get/post/etc.
 */
export function probeEndpointPath(fn: (...args: unknown[]) => unknown): string | undefined {
  let captured: string | undefined;

  const handler: ProxyHandler<object> = {
    get:
      () =>
      (...args: unknown[]) => {
        if (typeof args[0] === "string") captured = args[0];
        return Promise.resolve({});
      },
  };

  const mockHttp = new Proxy({}, handler);

  try {
    fn(mockHttp, {});
  } catch {
    // Endpoint may throw during probing — that's fine, path is already captured
  }

  return captured || undefined;
}
