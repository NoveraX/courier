import type { Catalog } from "./types-ui";
import type { RequestEntry } from "./types-request";

/**
 * Build a `Catalog` from request history — the runtime-observed endpoints
 * become the source of truth for playground dropdowns, explorer tree,
 * and audit scoring.
 *
 * This replaces the deleted `CatalogStore` (which was a zombie since the
 * scanner was removed in 6.1.4b) with a purely client-side derivation.
 */
export function buildCatalogFromRequests(requests: RequestEntry[]): Catalog {
  const catalog: Catalog = {};

  for (const req of requests) {
    if (!req.source) continue;
    const grpName = req.group ?? "";

    if (catalog[req.source]?.groups[grpName]?.endpoints[req.method]) continue;

    if (!catalog[req.source]) {
      catalog[req.source] = { baseURL: extractBaseURL(req.url), groups: {} };
    }

    if (!catalog[req.source].groups[grpName]) {
      catalog[req.source].groups[grpName] = {
        prefix: grpName ? `/${grpName}` : "",
        endpoints: {},
      };
    }

    catalog[req.source].groups[grpName].endpoints[req.method] = {
      type: req.type ?? "query",
      hasVariablesSchema: req.hasValidation?.variables ?? false,
      hasResponseSchema: req.hasValidation?.response ?? false,
      origin: "runtime",
      ...(req.transport && req.transport !== "http" && { transport: req.transport as "sse" | "ws" }),
    };
  }

  return catalog;
}

function extractBaseURL(url: string | undefined): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "";
  }
}
