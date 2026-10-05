import { endpointKeyOf } from "@/features/explorer/endpoint-key";
import { endpointParts, httpMethodOf } from "@/features/requests/request-parts";
import type { RequestEntry } from "@/store/types-request";
import type { AuditItem } from "./types";

/** An endpoint a finding names, as its table shows it. */
export interface FindingEndpoint {
  key: string;
  /** The HTTP method of its first call Studio still holds; `null` without one. */
  method: string | null;
  /** The source and its dot, dimmed, when the label is an endpoint's dotted name. */
  prefix: string;
  name: string;
  detail: string | null;
  /** What the Timeline is searched for to list its calls; `null` when the label is not an endpoint. */
  timelineQuery: string | null;
  /** Its first call, which opens in the inspector when there is no endpoint to search for. */
  firstRequestId: string | null;
}

/* An endpoint's dotted name: `source.method` or `source.group.method`. */
const DOTTED_NAME = /^[\w$-]+(?:\.[\w$-]+)+$/;

/**
 * A finding's line under its title: the first endpoint it names and what
 * was seen there, with how many more — or, for a finding about no
 * endpoint, its description.
 *
 * @param item - The finding
 * @returns The line
 * @example
 * ```ts
 * summaryOf(item); // "billing.invoices.list — 28% errors (39 calls) · 2 more"
 * ```
 */
export function summaryOf(item: Pick<AuditItem, "endpoints" | "description">): string {
  const [first, ...rest] = item.endpoints ?? [];
  if (!first) return item.description;
  const detail = first.detail ? ` — ${first.detail}` : "";
  return `${first.label}${detail}${rest.length > 0 ? ` · ${rest.length} more` : ""}`;
}

/* The endpoints a finding's calls reached, for a finding that names calls rather than endpoints. */
function endpointsOfCalls(
  ids: readonly string[],
  requests: ReadonlyMap<string, RequestEntry>,
): FindingEndpoint[] {
  const byKey = new Map<string, RequestEntry[]>();
  for (const id of ids) {
    const r = requests.get(id);
    if (!r) continue;
    const key = endpointKeyOf(r);
    const calls = byKey.get(key);
    if (calls) calls.push(r);
    else byKey.set(key, [r]);
  }
  return [...byKey].flatMap(([key, calls]) => {
    const [first] = calls;
    if (!first) return [];
    const { prefix, name } = endpointParts(first);
    const detail = `${calls.length} call${calls.length === 1 ? "" : "s"}`;
    return [
      {
        key,
        method: httpMethodOf(first),
        prefix,
        name,
        detail,
        timelineQuery: key,
        firstRequestId: first.id,
      },
    ];
  });
}

/**
 * The endpoints a finding names, each with the method of its first call,
 * its name split for showing the source dimmed, and where its calls are —
 * or, for a finding that names calls instead (a burst, a chain), the
 * endpoints those calls reached and how many each.
 *
 * @param item - The finding
 * @param requests - The requests Studio holds, by id
 * @returns The endpoints, in the finding's order
 * @example
 * ```ts
 * findingEndpoints(item, byId)[0]; // { method: "GET", prefix: "billing.", name: "invoices.list", … }
 * ```
 */
export function findingEndpoints(
  item: Pick<AuditItem, "endpoints" | "requestIds">,
  requests: ReadonlyMap<string, RequestEntry>,
): FindingEndpoint[] {
  const named = item.endpoints ?? [];
  if (named.length === 0) return endpointsOfCalls(item.requestIds ?? [], requests);
  return named.map((endpoint) => {
    const firstRequestId = endpoint.requestIds?.[0] ?? null;
    const first = firstRequestId ? requests.get(firstRequestId) : undefined;
    const dotted = DOTTED_NAME.test(endpoint.label);
    const dot = endpoint.label.indexOf(".");
    return {
      key: endpoint.key,
      method: first ? httpMethodOf(first) : null,
      prefix: dotted ? endpoint.label.slice(0, dot + 1) : "",
      name: dotted ? endpoint.label.slice(dot + 1) : endpoint.label,
      detail: endpoint.detail ?? null,
      timelineQuery: dotted ? endpoint.label : null,
      firstRequestId,
    };
  });
}
