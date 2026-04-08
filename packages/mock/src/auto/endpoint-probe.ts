import type { SchemaMetadata } from "./route-types";

/**
 * Endpoint introspection helpers.
 *
 * Extracted from `route-analyzer.ts` to isolate the side-effecting probing
 * logic (calling endpoint functions with a Proxy `http` to capture method/path)
 * and the symbol-based schema metadata extraction. Keeps the analyzer focused
 * on traversal and assembly.
 */

const ENDPOINT_SCHEMA = Symbol.for("nexus.endpoint.schema");

/** Probe endpoint to capture HTTP method and path */
export function probeEndpoint(fn: (...args: unknown[]) => unknown): {
  method?: string;
  path?: string;
} {
  let method: string | undefined;
  let path: string | undefined;

  const handler: ProxyHandler<object> = {
    get: (_target, prop) => {
      if (typeof prop === "string") {
        method = prop;
      }
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
    // Endpoint may throw during probing — path/method already captured
  }

  return { method, path: path || undefined };
}

/** Read the schema metadata symbol attached to an endpoint function */
export function extractSchema(fn: unknown): SchemaMetadata | undefined {
  if (typeof fn !== "function") return undefined;
  return (fn as unknown as Record<symbol, SchemaMetadata | undefined>)[ENDPOINT_SCHEMA];
}

/** Normalize a group prefix string: ensure leading "/" and no trailing "/" */
export function normalizePrefix(prefix: string): string {
  const trimmed = prefix.startsWith("/") ? prefix : `/${prefix}`;
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}
