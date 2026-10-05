import type { ColorMetric } from "./metric-value";
import { COLOR_METRICS } from "./metric-value";

/** The kinds the Endpoints tab narrows to. */
export const ENDPOINT_KINDS = ["all", "query", "mutation", "stream"] as const;
export type EndpointKind = (typeof ENDPOINT_KINDS)[number];

/** The Explorer's part of its address, each left out while it is the default. */
export interface ExplorerSearch {
  q?: string | undefined;
  metric?: ColorMetric | undefined;
  kind?: EndpointKind | undefined;
  /** The endpoint whose sheet is open, by its key. */
  endpoint?: string | undefined;
}

function oneOf<TValue extends string>(values: readonly TValue[], raw: unknown): TValue | undefined {
  return values.find((value) => value === raw);
}

/**
 * Read the Explorer's parameters from its address — its search, what it
 * colours by, the kind of endpoint listed and the endpoint open — keeping
 * only what differs from the defaults. The search stays as typed, its
 * spaces included; matching trims it.
 *
 * @param raw - The address's parameters
 * @returns The Explorer's parameters
 * @example
 * ```ts
 * validateExplorerSearch({ metric: "errors", kind: "all" }); // { metric: "errors" }
 * ```
 */
export function validateExplorerSearch(raw: Record<string, unknown>): ExplorerSearch {
  const search: ExplorerSearch = {};
  if (typeof raw.q === "string" && raw.q) search.q = raw.q;
  const metric = oneOf(COLOR_METRICS, raw.metric);
  if (metric && metric !== "latency") search.metric = metric;
  const kind = oneOf(ENDPOINT_KINDS, raw.kind);
  if (kind && kind !== "all") search.kind = kind;
  if (typeof raw.endpoint === "string" && raw.endpoint) search.endpoint = raw.endpoint;
  return search;
}
