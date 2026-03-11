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

    /* Extract grouped endpoints */
    if (options && "groups" in options && options.groups) {
      for (const [groupName, group] of Object.entries(
        options.groups as Record<string, Record<string, unknown>>,
      )) {
        const groupOptions = (group as { options?: { prefix?: string } }).options;
        groups[groupName] = {
          prefix: groupOptions?.prefix ?? "",
          endpoints: extractEndpoints(group),
        };
      }
    }

    /* Extract flat endpoints (top-level on source, supports mixed mode) */
    const flatEndpoints = extractEndpoints(source as unknown as Record<string, unknown>);
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

function extractEndpoints(
  obj: Record<string, unknown>,
): SourceMap[string]["groups"][string]["endpoints"] {
  const endpoints: SourceMap[string]["groups"][string]["endpoints"] = {};

  for (const [name, fn] of Object.entries(obj)) {
    if (name === "options" || typeof fn !== "function") continue;

    const schema = (fn as unknown as Record<symbol, SchemaMetadata | undefined>)[ENDPOINT_SCHEMA];

    endpoints[name] = {
      type: schema?.type,
      hasVariablesSchema: !!schema?.variables,
      hasResponseSchema: !!schema?.response,
    };
  }

  return endpoints;
}
