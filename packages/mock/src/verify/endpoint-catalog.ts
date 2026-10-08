import type { PlacedEndpoint } from "@noverax/courier/internal";
import { eachEndpoint, isDefinedApi } from "@noverax/courier/internal";

/** Every endpoint of every source, by source and by its call in the client. */
export type EndpointCatalog = ReadonlyMap<string, ReadonlyMap<string, PlacedEndpoint>>;

/* The name a lone source is kept under: recordings of one API name none. */
export const LONE_SOURCE = "";

/**
 * The endpoints recordings are checked against: those of one source, or of
 * each source a config names — `config.sources` — the values that are not
 * APIs left out.
 *
 * @param sources - An API, or the APIs by name
 * @returns The endpoints of each, by their call in the client
 * @example
 * ```ts
 * catalogOf(config.sources).get("shop")?.get("orders.get")?.path; // → "orders/:id"
 * ```
 */
export function catalogOf(sources: object): EndpointCatalog {
  const named: Array<[string, object]> = isDefinedApi(sources)
    ? [[LONE_SOURCE, sources]]
    : Object.entries(sources).filter((entry): entry is [string, object] => isDefinedApi(entry[1]));
  return new Map(
    named.map(([name, api]) => [
      name,
      new Map([...eachEndpoint(api)].map((endpoint) => [endpoint.id, endpoint])),
    ]),
  );
}

/**
 * The endpoint a recording names: in its source when it names one and the
 * catalog holds several, else in the first source that has it.
 *
 * @param catalog - The endpoints
 * @param source - The source the recording names, if any
 * @param id - The endpoint's call in the client
 * @returns The endpoint, with the source it is in, or why there is none
 * @example
 * ```ts
 * findEndpoint(catalog, "shop", "orders.get");
 * ```
 */
export function findEndpoint(
  catalog: EndpointCatalog,
  source: string | undefined,
  id: string,
): { source: string; endpoint: PlacedEndpoint } | { missing: string } {
  const lone = catalog.has(LONE_SOURCE);
  if (source !== undefined && !lone) {
    const endpoints = catalog.get(source);
    if (!endpoints) return { missing: `the source ${source} is no longer defined` };
    const endpoint = endpoints.get(id);
    return endpoint ? { source, endpoint } : { missing: `${id} is no longer defined in ${source}` };
  }
  for (const [name, endpoints] of catalog) {
    const endpoint = endpoints.get(id);
    if (endpoint) return { source: name, endpoint };
  }
  return { missing: `${id} is no longer defined` };
}
