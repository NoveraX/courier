import type { Catalog, CatalogEndpoint } from "./types-ui";
import type { RequestEntry } from "./types-request";
import { ownValue } from "@/lib/own-value";

/**
 * Build a `Catalog` from request history — the endpoints traffic showed,
 * each with the middleware that ran for it. The Explorer merges it with
 * the API the config declares (`buildCatalogFromScan`).
 *
 * @param requests - The captured requests, newest first
 * @returns Every source, group and endpoint the requests named
 *
 * @example
 * ```ts
 * const observed = buildCatalogFromRequests(useStudioStore.getState().requests);
 * ```
 */
export function buildCatalogFromRequests(requests: RequestEntry[]): Catalog {
  const catalog: Catalog = {};

  for (const req of requests) {
    if (!req.source) continue;
    const grpName = req.group ?? "";
    const source = ownValue(catalog, req.source) ?? { baseURL: extractBaseURL(req.url), groups: {} };
    catalog[req.source] = source;
    const group = ownValue(source.groups, grpName) ?? {
      prefix: grpName ? `/${grpName}` : "",
      endpoints: {},
    };
    source.groups[grpName] = group;

    const known = ownValue(group.endpoints, req.method);
    group.endpoints[req.method] = known ? withMiddlewareOf(known, req) : endpointOf(req);
  }

  return catalog;
}

function endpointOf(req: RequestEntry): CatalogEndpoint {
  return {
    type: req.type ?? "query",
    hasVariablesSchema: req.hasValidation?.variables ?? false,
    hasResponseSchema: req.hasValidation?.response ?? false,
    origin: "runtime",
    ...(req.transport && req.transport !== "http" && { transport: req.transport }),
    ...(req.middlewareEntries.length > 0 && { middleware: middlewareNames(req) }),
  };
}

/**
 * The middleware that ran, read from the call that entered the most of it:
 * a call a middleware stopped early never entered the ones after it.
 */
function withMiddlewareOf(endpoint: CatalogEndpoint, req: RequestEntry): CatalogEndpoint {
  const names = middlewareNames(req);
  if (names.length <= (endpoint.middleware?.length ?? 0)) return endpoint;
  return { ...endpoint, middleware: names };
}

/** Each link of the chain once, in chain order; a retry enters the links after it again. */
function middlewareNames(req: RequestEntry): string[] {
  const byIndex = new Map<number, string>();
  for (const entry of req.middlewareEntries) {
    if (!byIndex.has(entry.index)) byIndex.set(entry.index, entry.name);
  }
  return [...byIndex.entries()].sort(([a], [b]) => a - b).map(([, name]) => name);
}

function extractBaseURL(url: string | undefined): string {
  if (!url || !URL.canParse(url)) return "";
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}`;
}
