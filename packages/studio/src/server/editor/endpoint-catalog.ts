import { eachEndpoint, isDefinedApi } from "@noverax/courier/internal";

/** An endpoint as a call in the code names it. */
export interface CatalogEndpoint {
  readonly source: string;
  /** Its call in the client: `live.orders` */
  readonly endpoint: string;
  /** The names a call to it ends with: `["live", "orders"]` */
  readonly parts: readonly string[];
  readonly kind: "query" | "mutation" | "stream" | "channel";
}

const cache = new WeakMap<object, CatalogEndpoint[]>();

/**
 * Every endpoint the running config's sources define, as a call names it —
 * worked out once per config Studio loads.
 *
 * @param sources - The sources the config declares
 * @returns The endpoints, source by source
 * @example
 * ```ts
 * endpointCatalog(running.config.sources).map((e) => `${e.source} ${e.endpoint}`); // ["shop live.orders", …]
 * ```
 */
export function endpointCatalog(sources: Readonly<Record<string, unknown>>): CatalogEndpoint[] {
  const cached = cache.get(sources);
  if (cached) return cached;
  const catalog: CatalogEndpoint[] = [];
  for (const [source, api] of Object.entries(sources)) {
    if (!isDefinedApi(api)) continue;
    for (const { id, kind } of eachEndpoint(api)) {
      catalog.push({ source, endpoint: id, parts: id.split("."), kind });
    }
  }
  cache.set(sources, catalog);
  return catalog;
}
