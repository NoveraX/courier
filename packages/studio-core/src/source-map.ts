import type { AnySource, Sources } from "@noverax/courier/define";
import {
  type ChainStep,
  eachGroup,
  groupOptionsOf,
  middlewareChainOf,
} from "@noverax/courier/internal";
import type { SourceMap } from "./events";
import { extractSchemaFields, extractSchemaStub } from "./schema-fields";
import { isEndpoint, probeEndpoint } from "./source-map-probe";

const ENDPOINT_SCHEMA = Symbol.for("courier.endpoint.schema");

interface SchemaMetadata {
  response?: unknown;
  variables?: unknown;
  type?: "query" | "mutation";
  transport?: "http" | "sse" | "ws";
  receive?: unknown;
  defaults?: Readonly<Record<string, unknown>>;
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

    /* Extract grouped endpoints: every group, those inside others keyed by
       their path and at their prefixes joined in turn. */
    for (const placed of eachGroup(source)) {
      groups[placed.path] = {
        prefix: prefixOf(groupOptionsOf(placed.chain)),
        endpoints: extractEndpoints(placed.group, chainsIn(source, placed.path)),
      };
    }

    /* Extract flat endpoints (top-level on source, supports mixed mode) */
    const flatEndpoints = extractEndpoints(source, chainsIn(source, ""));
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

/* The middleware each endpoint of a group runs through, as a call builds it, by the endpoint's name. */
function chainsIn(source: AnySource, groupPath: string): (name: string) => ChainStep[] {
  return (name) => middlewareChainOf(source, groupPath, name);
}

/**
 * Extract endpoint metadata from a group or source object.
 *
 * @param obj - The group, or the source for its own endpoints
 * @param chainOf - The middleware an endpoint of it runs through, by its name
 * @returns Each endpoint's metadata, by its name
 */
export function extractEndpoints(
  obj: object,
  chainOf: (name: string) => ChainStep[],
): SourceMap[string]["groups"][string]["endpoints"] {
  const endpoints: SourceMap[string]["groups"][string]["endpoints"] = {};

  const members: Array<[string, unknown]> = Object.entries(obj);
  for (const [name, fn] of members) {
    if (name === "options" || !isEndpoint(fn)) continue;

    const schema = (fn as Record<symbol, SchemaMetadata | undefined>)[ENDPOINT_SCHEMA];
    const probed = probeEndpoint(fn);
    const httpMethod = normalizeHttpMethod(probed.method);

    const variablesStub = schema?.variables ? extractSchemaStub(schema.variables) : undefined;
    const variablesFields = schema?.variables ? extractSchemaFields(schema.variables) : undefined;

    const transport = schema?.transport;
    const middleware = chainOf(name);

    endpoints[name] = {
      type: schema?.type,
      hasVariablesSchema: !!schema?.variables,
      hasResponseSchema: !!schema?.response,
      ...(middleware.length > 0 && { middleware }),
      ...(probed.path && { path: probed.path }),
      ...(httpMethod && { httpMethod }),
      ...(variablesStub && { variablesStub }),
      ...(variablesFields && { variablesFields }),
      ...(schema?.defaults && { variablesDefaults: { ...schema.defaults } }),
      ...(transport && transport !== "http" && { transport }),
      ...(transport === "ws" && schema?.receive ? { hasReceiveSchema: true } : {}),
      ...(probed.served && { served: true }),
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

/* A group's prefix, from options a config written without types may shape freely. */
function prefixOf(options: unknown): string {
  if (typeof options !== "object" || options === null || !("prefix" in options)) return "";
  return typeof options.prefix === "string" ? options.prefix : "";
}
