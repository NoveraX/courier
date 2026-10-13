import type { ScannedEndpoint, ScannedSource } from "@/features/apis/types";
import type { Catalog, CatalogEndpoint, CatalogGroup } from "./types-ui";

/** Endpoints a source declares without a group are keyed under `""`. */
const FLAT_GROUP = "";

/**
 * Build a `Catalog` from the sources the config declares, as Studio
 * describes them in `scan:sources` — the API the APIs page lists, whether
 * or not any of it has been called.
 *
 * @param sources - The declared sources
 * @returns Each source with its groups and endpoints, marked as declared
 *
 * @example
 * ```ts
 * const declared = buildCatalogFromScan(useStudioStore.getState().scanSources)
 * ```
 */
export function buildCatalogFromScan(sources: readonly ScannedSource[]): Catalog {
  const catalog: Catalog = {};
  for (const source of sources) {
    const groups: Record<string, CatalogGroup> = {};
    for (const group of source.groups) {
      groups[group.name] = { prefix: group.prefix, endpoints: endpointsOf(group.endpoints) };
    }
    if (source.inlineEndpoints?.length) {
      groups[FLAT_GROUP] = { prefix: "", endpoints: endpointsOf(source.inlineEndpoints) };
    }
    catalog[source.name] = {
      baseURL: source.baseURL,
      ...(source.proxyPath && { proxyPath: source.proxyPath }),
      groups,
    };
  }
  return catalog;
}

function endpointsOf(endpoints: readonly ScannedEndpoint[]): Record<string, CatalogEndpoint> {
  const byName: Record<string, CatalogEndpoint> = {};
  for (const { name, analysis } of endpoints) {
    byName[name] = {
      type: analysis.type ?? undefined,
      hasVariablesSchema: analysis.hasVariablesType,
      hasResponseSchema: analysis.hasResponseType,
      path: analysis.path,
      httpMethod: analysis.httpMethod.toUpperCase(),
      origin: "scan",
      ...(analysis.transport && { transport: analysis.transport }),
      ...(analysis.middleware?.length && { middleware: analysis.middleware }),
      ...(analysis.variablesStub && { variablesStub: analysis.variablesStub }),
      ...(analysis.variablesFields && { variablesFields: analysis.variablesFields }),
      ...(analysis.variablesDefaults && { variablesDefaults: analysis.variablesDefaults }),
      ...(analysis.hasReceiveSchema && { hasReceiveSchema: true }),
      ...(analysis.served && { served: true }),
      ...(analysis.agent && { agent: analysis.agent }),
    };
  }
  return byName;
}
