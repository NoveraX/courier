import type { Sources } from "@noverax/nexus/define";
import type { SourceMap } from "./events";

const ENDPOINT_SCHEMA = Symbol.for("nexus.endpoint.schema");

interface SchemaMetadata {
  response?: unknown;
  variables?: unknown;
  type?: "query" | "mutation";
}

/** Extract a SourceMap from Sources for DevTools connection:init */
export function extractSourceMap(sources: Sources): SourceMap {
  const result: SourceMap = {};

  for (const [sourceName, source] of Object.entries(sources)) {
    const options = source.options;
    const groups: SourceMap[string]["groups"] = {};
    const mwNames = extractMiddlewareNames(options);

    /* Extract grouped endpoints */
    if (options && "groups" in options && options.groups) {
      for (const [groupName, group] of Object.entries(
        options.groups as Record<string, Record<string, unknown>>,
      )) {
        const groupOptions = (group as { options?: { prefix?: string } }).options;
        groups[groupName] = {
          prefix: groupOptions?.prefix ?? "",
          endpoints: extractEndpoints(group, mwNames),
        };
      }
    }

    /* Extract flat endpoints (top-level on source, supports mixed mode) */
    const flatEndpoints = extractEndpoints(source as unknown as Record<string, unknown>, mwNames);
    if (Object.keys(flatEndpoints).length > 0) {
      groups[""] = { prefix: "", endpoints: flatEndpoints };
    }

    result[sourceName] = {
      baseURL: options?.baseURL ?? "",
      groups,
    };
  }

  return result;
}

/** Pull middleware function names from source options */
function extractMiddlewareNames(options: Record<string, unknown> | undefined): string[] {
  if (!options || !Array.isArray(options.middleware)) return [];
  return (options.middleware as Array<(...args: unknown[]) => unknown>).map(
    (fn, i) => fn.name || `middleware[${i}]`,
  );
}

function extractEndpoints(
  obj: Record<string, unknown>,
  middlewareNames: string[],
): SourceMap[string]["groups"][string]["endpoints"] {
  const endpoints: SourceMap[string]["groups"][string]["endpoints"] = {};

  for (const [name, fn] of Object.entries(obj)) {
    if (name === "options" || typeof fn !== "function") continue;

    const schema = (fn as unknown as Record<symbol, SchemaMetadata | undefined>)[ENDPOINT_SCHEMA];
    const path = probeEndpointPath(fn as (...args: unknown[]) => unknown);

    endpoints[name] = {
      type: schema?.type,
      hasVariablesSchema: !!schema?.variables,
      hasResponseSchema: !!schema?.response,
      ...(middlewareNames.length > 0 && { middleware: middlewareNames }),
      ...(path && { path }),
    };
  }

  return endpoints;
}

/**
 * Probes an endpoint function with a mock http client to capture
 * the path template (e.g. ":id") passed to http.get/post/etc.
 */
function probeEndpointPath(fn: (...args: unknown[]) => unknown): string | undefined {
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
