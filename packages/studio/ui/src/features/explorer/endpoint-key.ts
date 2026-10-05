import type { RequestEntry } from "@/store/types";

/** Where an endpoint is: its source, its group (empty for one outside any) and its method. */
export interface EndpointRef {
  source: string;
  group: string;
  method: string;
}

/**
 * An endpoint's dotted name: `source.group.method`, or `source.method` for
 * one outside any group.
 *
 * @param ref - The endpoint
 * @returns Its key
 * @example
 * ```ts
 * endpointKey({ source: "api", group: "orders", method: "create" }); // "api.orders.create"
 * ```
 */
export function endpointKey({ source, group, method }: EndpointRef): string {
  return group ? `${source}.${group}.${method}` : `${source}.${method}`;
}

/**
 * The key of the endpoint a request called.
 *
 * @param r - The request
 * @returns Its endpoint's key
 * @example
 * ```ts
 * endpointKeyOf(request); // "api.users.list"
 * ```
 */
export function endpointKeyOf(r: Pick<RequestEntry, "source" | "group" | "method">): string {
  return endpointKey({ source: r.source, group: r.group ?? "", method: r.method });
}

/**
 * An endpoint's name in two parts, as the Explorer writes it: its source,
 * shown dim, then its group and method.
 *
 * @param ref - The endpoint
 * @returns The source, and the rest of the name
 * @example
 * ```ts
 * keyParts({ source: "api", group: "orders", method: "create" }); // { source: "api", rest: "orders.create" }
 * ```
 */
export function keyParts({ source, group, method }: EndpointRef): { source: string; rest: string } {
  return { source, rest: group ? `${group}.${method}` : method };
}

/**
 * How long ago something happened, compactly: `0s`, `57s`, `3m`, `2h`, `4d`.
 *
 * @param ms - How long ago, in ms
 * @returns The span
 * @example
 * ```ts
 * shortAgo(125_000); // "2m"
 * ```
 */
export function shortAgo(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1_000));
  if (s < 60) return `${s}s`;
  if (s < 3_600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3_600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}

/**
 * When an endpoint was last called, as its list and its panel say it.
 *
 * @param last - When its newest call was made, if ever
 * @param now - The time now
 * @returns `never`, `just now`, or how long ago
 * @example
 * ```ts
 * lastCallLabel(Date.now() - 57_000, Date.now()); // "57s ago"
 * ```
 */
export function lastCallLabel(last: number | undefined, now: number): string {
  if (last === undefined) return "never";
  return now - last < 1_000 ? "just now" : `${shortAgo(now - last)} ago`;
}
