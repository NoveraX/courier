import type { Sources } from "@noverax/nexus/define";
import type { SourceMap } from "./events";
import { probeEndpoint } from "./source-map-probe";
import { extractSchemaStub } from "./source-map-schema";

const ENDPOINT_SCHEMA = Symbol.for("nexus.endpoint.schema");

interface SchemaMetadata {
  response?: unknown;
  variables?: unknown;
  type?: "query" | "mutation";
  transport?: "http" | "sse" | "ws";
  receive?: unknown;
}

/**
 * Extract a SourceMap from Sources for Studio connection:init.
 *
 * `appOrigin` (when provided) is stamped onto every source entry so the
 * Studio UI can resolve relative `proxyPath` values (e.g. `/api/sse`) into
 * full clickable URLs against the user-app's own origin. The Playground
 * proxy executor uses the same value at runtime via `getAppOriginParsed()`.
 */
export function extractSourceMap(sources: Sources, appOrigin?: string): SourceMap {
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

    const proxyPath = options?.proxyPath;
    result[sourceName] = {
      baseURL: options?.baseURL ?? "",
      ...(appOrigin && { appOrigin }),
      ...(proxyPath && { proxyPath }),
      groups,
    };
  }

  return result;
}

/** Pull middleware function names from source options */
export function extractMiddlewareNames(options: Record<string, unknown> | undefined): string[] {
  if (!options || !Array.isArray(options.middleware)) return [];
  return (options.middleware as Array<(...args: unknown[]) => unknown>).map(
    (fn, i) => fn.name || `middleware[${i}]`,
  );
}

/** Extract endpoint metadata from a group or source object */
export function extractEndpoints(
  obj: Record<string, unknown>,
  middlewareNames: string[],
): SourceMap[string]["groups"][string]["endpoints"] {
  const endpoints: SourceMap[string]["groups"][string]["endpoints"] = {};

  for (const [name, fn] of Object.entries(obj)) {
    if (name === "options" || typeof fn !== "function") continue;

    const schema = (fn as unknown as Record<symbol, SchemaMetadata | undefined>)[ENDPOINT_SCHEMA];
    const probed = probeEndpoint(fn as (...args: unknown[]) => unknown);
    const httpMethod = normalizeHttpMethod(probed.method);

    const variablesStub = schema?.variables ? extractSchemaStub(schema.variables) : undefined;

    const transport = schema?.transport;

    endpoints[name] = {
      type: schema?.type,
      hasVariablesSchema: !!schema?.variables,
      hasResponseSchema: !!schema?.response,
      ...(middlewareNames.length > 0 && { middleware: middlewareNames }),
      ...(probed.path && { path: probed.path }),
      ...(httpMethod && { httpMethod }),
      ...(variablesStub && { variablesStub }),
      ...(transport && transport !== "http" && { transport }),
      ...(transport === "ws" && schema?.receive ? { hasReceiveSchema: true } : {}),
    };
  }

  return endpoints;
}

/** Normalize probed method name to uppercase HTTP method */
function normalizeHttpMethod(method: string | undefined): string | undefined {
  if (!method) return undefined;
  const map: Record<string, string> = {
    get: "GET",
    post: "POST",
    put: "PUT",
    patch: "PATCH",
    del: "DELETE",
    delete: "DELETE",
    head: "HEAD",
    options: "OPTIONS",
  };
  return map[method] ?? method.toUpperCase();
}
