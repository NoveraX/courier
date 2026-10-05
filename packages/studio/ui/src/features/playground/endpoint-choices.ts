import { endpointKey } from "@/features/explorer/endpoint-key";
import { methodLabelOf } from "@/features/explorer/method-label";
import { joinPath } from "@/lib/join-path";
import type { Catalog, CatalogEndpoint, CatalogEntry } from "@/store/types-ui";

/** An endpoint the Playground can send to, with what it needs to show and call it. */
export interface PlaygroundEndpoint {
  key: string;
  source: string;
  group: string;
  method: string;
  def: CatalogEndpoint;
  entry: CatalogEntry;
  transport: "http" | "sse" | "ws";
  httpMethod: string;
  /** Its HTTP method, or `WS` / `SSE` for a stream. */
  label: string;
  /** Its path under its source: the group's prefix and its own. */
  path: string;
}

export type ChoiceRow =
  | { kind: "source"; source: string }
  | { kind: "endpoint"; endpoint: PlaygroundEndpoint };

function choiceOf(
  source: string,
  group: string,
  method: string,
  entry: CatalogEntry,
): PlaygroundEndpoint | undefined {
  const def = entry.groups[group]?.endpoints[method];
  if (!def) return undefined;
  const transport = def.transport ?? "http";
  const httpMethod = (def.httpMethod ?? (def.type === "mutation" ? "POST" : "GET")).toUpperCase();
  return {
    key: endpointKey({ source, group, method }),
    source,
    group,
    method,
    def,
    entry,
    transport,
    httpMethod,
    label: methodLabelOf({ transport, httpMethod }),
    path: joinPath(entry.groups[group]?.prefix ?? "", def.path ?? ""),
  };
}

/**
 * Every endpoint the Playground can send to, by source, group and method.
 *
 * @param catalog - The sources it can send to
 * @returns The endpoints, sorted
 * @example
 * ```ts
 * endpointChoicesOf(catalog)[0]?.key; // "api.orders.create"
 * ```
 */
export function endpointChoicesOf(catalog: Catalog): PlaygroundEndpoint[] {
  const byName = (a: string, b: string) => a.localeCompare(b);
  return Object.keys(catalog)
    .sort(byName)
    .flatMap((source) => {
      const entry = catalog[source];
      if (!entry) return [];
      return Object.keys(entry.groups)
        .sort(byName)
        .flatMap((group) =>
          Object.keys(entry.groups[group]?.endpoints ?? {})
            .sort(byName)
            .flatMap((method) => choiceOf(source, group, method, entry) ?? []),
        );
    });
}

/**
 * The picker's rows: the endpoints whose name or path matches the search,
 * each source's under a header naming it.
 *
 * @param choices - The endpoints
 * @param query - The search
 * @returns The rows, top to bottom
 * @example
 * ```ts
 * choiceRows(choices, "orders")[0]; // { kind: "source", source: "api" }
 * ```
 */
export function choiceRows(choices: readonly PlaygroundEndpoint[], query: string): ChoiceRow[] {
  const q = query.trim().toLowerCase();
  const rows: ChoiceRow[] = [];
  let last: string | undefined;
  for (const endpoint of choices) {
    if (q && !endpoint.key.toLowerCase().includes(q) && !endpoint.path.toLowerCase().includes(q))
      continue;
    if (endpoint.source !== last) rows.push({ kind: "source", source: endpoint.source });
    last = endpoint.source;
    rows.push({ kind: "endpoint", endpoint });
  }
  return rows;
}
