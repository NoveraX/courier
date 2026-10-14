import { routesExportName } from "@noverax/courier-cli/devkit";
import type { CodeCall } from "./calls-in-text";
import type { CatalogEndpoint } from "./endpoint-catalog";
import { positionsIn } from "./text-positions";

/** An endpoint a call reaches. */
export interface CalledEndpoint {
  readonly source: string;
  readonly endpoint: string;
}

/** A call in a file matched with the endpoints it may reach. */
export interface EndpointCall {
  /** Where the endpoint's name is written: lines and columns from 1 */
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
  /** The endpoints it may reach, the likeliest first: one unless sources share its name */
  readonly endpoints: readonly CalledEndpoint[];
}

/**
 * Match a file's calls with the endpoints they reach: a call reaches an
 * endpoint when it ends with the endpoint's names — `live.orders` — after
 * whatever it is made on. A caller the file creates for a source, or the
 * source's name written before the endpoint's — `backend.shop.account.me()` —
 * settles which source; without either, a call matches each source with an
 * endpoint of that name. A top-level endpoint matches only through a
 * caller or its source's name: its one name — `get`, `list` — is too common
 * to tell a call by.
 *
 * @param calls - The calls found in the file
 * @param catalog - The endpoints the running config defines
 * @param text - The file's text, which places each call
 * @returns The calls that reach an endpoint, in the order written
 * @example
 * ```ts
 * matchCalls(codeCalls("cart.ts", text), catalog, text)[0]?.endpoints; // [{ source: "shop", endpoint: "cart.add" }]
 * ```
 */
export function matchCalls(
  calls: readonly CodeCall[],
  catalog: readonly CatalogEndpoint[],
  text: string,
): EndpointCall[] {
  const position = positionsIn(text);
  const matched: EndpointCall[] = [];
  for (const call of calls) {
    const endpoints = endpointsOf(call, catalog);
    if (endpoints.length === 0) continue;
    const from = position(call.start);
    const to = position(call.end);
    matched.push({
      line: from.line,
      column: from.column,
      endLine: to.line,
      endColumn: to.column,
      endpoints: endpoints.map(({ source, endpoint }) => ({ source, endpoint })),
    });
  }
  return matched;
}

function endpointsOf(call: CodeCall, catalog: readonly CatalogEndpoint[]): CatalogEndpoint[] {
  const named = catalog.filter((e) => endsWith(call.names, e.parts));
  if (named.length === 0) return [];
  /* A caller made from a source's routes names it by the routes' export: `shopRoutes`. */
  const bySource = named.filter(
    (e) => e.source === call.callerSource || routesExportName(e.source) === call.callerSource,
  );
  if (bySource.length > 0) return bySource;
  const written = named.filter(
    (e) => call.names[call.names.length - e.parts.length - 1] === e.source,
  );
  if (written.length > 0) return written;
  return call.onCaller ? named : named.filter((e) => e.parts.length > 1);
}

/* The names end with the endpoint's, and something comes before them. */
function endsWith(names: readonly string[], parts: readonly string[]): boolean {
  const offset = names.length - parts.length;
  if (offset < 1) return false;
  return parts.every((part, index) => names[offset + index] === part);
}
