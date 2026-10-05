import type { EndpointNode, ExplorerModel, SourceNode } from "./explorer-model";
import type { EndpointKind } from "./explorer-search";

export type EndpointRow =
  | { kind: "source"; source: SourceNode }
  | { kind: "endpoint"; endpoint: EndpointNode };

/**
 * The kind an endpoint lists under: a stream, or a query or a mutation.
 *
 * @param e - The endpoint
 * @returns Its kind
 * @example
 * ```ts
 * kindOf(endpoint); // "mutation"
 * ```
 */
export function kindOf(e: EndpointNode): Exclude<EndpointKind, "all"> {
  if (e.transport !== "http") return "stream";
  return e.type === "mutation" ? "mutation" : "query";
}

/**
 * How many endpoints each kind holds.
 *
 * @param model - The Explorer's model
 * @returns The count per kind, all of them under `all`
 * @example
 * ```ts
 * kindCounts(model); // { all: 25, query: 12, mutation: 8, stream: 5 }
 * ```
 */
export function kindCounts(model: ExplorerModel): Record<EndpointKind, number> {
  const counts = { all: model.endpoints.length, query: 0, mutation: 0, stream: 0 };
  for (const e of model.endpoints) counts[kindOf(e)] += 1;
  return counts;
}

/**
 * The Endpoints tab's rows: each source's endpoints of the kind asked for
 * that match the search — by key or by path — under a header naming the
 * source.
 *
 * @param model - The Explorer's model
 * @param query - The search
 * @param kind - The kind
 * @returns The rows, top to bottom
 * @example
 * ```ts
 * endpointRows(model, "orders", "all")[0]; // { kind: "source", source: api }
 * ```
 */
export function endpointRows(
  model: ExplorerModel,
  query: string,
  kind: EndpointKind,
): EndpointRow[] {
  const q = query.trim().toLowerCase();
  const rows: EndpointRow[] = [];
  for (const source of model.sources) {
    const matching = source.endpoints.filter(
      (e) =>
        (kind === "all" || kindOf(e) === kind) &&
        (!q || e.key.toLowerCase().includes(q) || e.path.toLowerCase().includes(q)),
    );
    if (!matching.length) continue;
    rows.push({ kind: "source", source });
    for (const endpoint of matching) rows.push({ kind: "endpoint", endpoint });
  }
  return rows;
}
