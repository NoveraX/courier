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

    if (options && "groups" in options && options.groups) {
      for (const [groupName, group] of Object.entries(
        options.groups as Record<string, Record<string, unknown>>,
      )) {
        const groupOptions = (group as { options?: { prefix?: string } }).options;
        const endpoints: SourceMap[string]["groups"][string]["endpoints"] = {};

        for (const [endpointName, endpointFn] of Object.entries(group)) {
          if (endpointName === "options" || typeof endpointFn !== "function") continue;

          const schema = (endpointFn as unknown as Record<symbol, SchemaMetadata | undefined>)[
            ENDPOINT_SCHEMA
          ];

          endpoints[endpointName] = {
            type: schema?.type,
            hasVariablesSchema: !!schema?.variables,
            hasResponseSchema: !!schema?.response,
          };
        }

        groups[groupName] = {
          prefix: groupOptions?.prefix ?? "",
          endpoints,
        };
      }
    }

    result[sourceName] = {
      baseURL: options?.baseURL ?? "",
      groups,
    };
  }

  return result;
}
