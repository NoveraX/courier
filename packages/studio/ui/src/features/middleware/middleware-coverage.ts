import type { ChainStep, MiddlewareLayer } from "@noverax/courier/internal";

import { endpointKey } from "@/features/explorer/endpoint-key";
import type { Catalog } from "@/store/types-ui";
import type { MiddlewareStat } from "./middleware-stats";

/** An endpoint as the coverage lists it, with the chain a call to it runs through. */
export interface CoveredEndpoint {
  key: string;
  source: string;
  group: string;
  method: string;
  httpMethod: string | undefined;
  chain: readonly ChainStep[];
}

/** One middleware: where it is declared, the endpoints it covers, and what the session's calls through it came to. */
export interface CoverageRow {
  /** Its name and where it is declared: two of one name declared apart are two rows. */
  key: string;
  name: string;
  layer: MiddlewareLayer;
  endpoints: CoveredEndpoint[];
  /** The calls that ran through a middleware of its name this session, and those it failed. */
  calls: number;
  errors: number;
}

/** Which endpoints each middleware covers, among the endpoints counted. */
export interface MiddlewareCoverage {
  /** The declared endpoints counted: every source's, or those of the one picked. */
  total: number;
  /** Each middleware, in the order a call meets them, the most covered first within a layer. */
  rows: CoverageRow[];
  /** The endpoints that run through none. */
  uncovered: CoveredEndpoint[];
  /** The sources with declared endpoints, which the coverage can be narrowed to. */
  sources: string[];
}

const LAYER_ORDER: Readonly<Record<MiddlewareLayer, number>> = { api: 0, retry: 1, endpoint: 2 };

/**
 * Which endpoints each middleware covers — every middleware declared
 * anywhere in an API, read from the definitions rather than from the calls,
 * so one no call has run through yet is counted too, beside what the
 * session's calls through it came to. Only the endpoints the definitions
 * declare are counted; one seen only in traffic has no chain to read.
 *
 * @param catalog - The sources, with each declared endpoint's chain
 * @param stats - What the session's calls through each middleware came to, by name
 * @param source - The one source to count, or every one
 * @returns The coverage
 * @example
 * ```ts
 * middlewareCoverage(catalog, middlewareOverview(calls).stats).rows[0]; // { name: "audit", layer: "api", endpoints: [...], … }
 * ```
 */
export function middlewareCoverage(
  catalog: Catalog,
  stats: readonly MiddlewareStat[],
  source?: string,
): MiddlewareCoverage {
  const declared = declaredEndpoints(catalog);
  const counted = source === undefined ? declared : declared.filter((e) => e.source === source);
  const rows = new Map<string, CoverageRow>();
  const byName = new Map(stats.map((stat) => [stat.name, stat]));
  for (const endpoint of counted) {
    for (const { name, layer } of endpoint.chain) {
      const key = `${layer}:${name}`;
      const row = rows.get(key) ?? {
        key,
        name,
        layer,
        endpoints: [],
        calls: byName.get(name)?.calls ?? 0,
        errors: byName.get(name)?.errors ?? 0,
      };
      if (!row.endpoints.includes(endpoint)) row.endpoints.push(endpoint);
      rows.set(key, row);
    }
  }
  return {
    total: counted.length,
    rows: [...rows.values()].sort(
      (a, b) =>
        LAYER_ORDER[a.layer] - LAYER_ORDER[b.layer] ||
        b.endpoints.length - a.endpoints.length ||
        a.name.localeCompare(b.name),
    ),
    uncovered: counted.filter((endpoint) => endpoint.chain.length === 0),
    sources: [...new Set(declared.map((endpoint) => endpoint.source))],
  };
}

/* Every endpoint the definitions declare, each with its chain: none when it runs through none. */
function declaredEndpoints(catalog: Catalog): CoveredEndpoint[] {
  const endpoints: CoveredEndpoint[] = [];
  for (const [source, entry] of Object.entries(catalog)) {
    for (const [group, { endpoints: byName }] of Object.entries(entry.groups)) {
      for (const [method, endpoint] of Object.entries(byName)) {
        if (endpoint.origin === "runtime") continue;
        endpoints.push({
          key: endpointKey({ source, group, method }),
          source,
          group,
          method,
          httpMethod: endpoint.httpMethod,
          chain: endpoint.chain ?? [],
        });
      }
    }
  }
  return endpoints;
}
