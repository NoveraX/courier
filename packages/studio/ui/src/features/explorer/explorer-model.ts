import type { Catalog, RequestEntry } from "@/store/types";
import type { EndpointRef } from "./endpoint-key";
import { endpointKeyOf } from "./endpoint-key";
import type { EndpointMetrics, HealthLevel } from "./endpoint-metrics";
import { levelOf, metricsOf } from "./endpoint-metrics";
import type { NodeContext } from "./endpoint-node";
import { endpointOf } from "./endpoint-node";
import { groupOf, groupPaths } from "./group-nodes";

/** An endpoint as the Explorer shows it: its definition, its calls and how it is doing. */
export interface EndpointNode extends EndpointRef {
  key: string;
  httpMethod: string;
  transport: "http" | "sse" | "ws";
  type: "query" | "mutation" | undefined;
  path: string;
  url: string;
  middleware: string[];
  hasVariablesSchema: boolean;
  hasResponseSchema: boolean;
  /** Known only by its traffic: courier.config does not declare its source. */
  trafficOnly: boolean;
  /** Whether any of its calls went through Courier's proxy. */
  proxied: boolean;
  /** Its calls, newest first. */
  requests: RequestEntry[];
  metrics: EndpointMetrics;
  level: HealthLevel;
}

export interface GroupNode {
  key: string;
  source: string;
  /** Its own name: `invoices` of `billing.invoices`. */
  name: string;
  /** Its path in its source: `billing.invoices`. */
  path: string;
  /** How many groups it sits inside: 0 for a group of the source itself. */
  depth: number;
  /** The key of the group it sits inside, if it sits inside one. */
  parent: string | undefined;
  /** Its own endpoints; the groups inside it hold theirs. */
  endpoints: EndpointNode[];
  /** Its endpoints and every group's inside it, which its metrics add up. */
  subtree: EndpointNode[];
  metrics: EndpointMetrics;
  level: HealthLevel;
}

export interface SourceNode {
  name: string;
  baseURL: string;
  /** Every group, in tree order: a group before the groups inside it. */
  groups: GroupNode[];
  /** Endpoints outside any group. */
  loose: EndpointNode[];
  endpoints: EndpointNode[];
  metrics: EndpointMetrics;
  level: HealthLevel;
}

/** The project's API surface with what this session did with it. */
export interface ExplorerModel {
  sources: SourceNode[];
  endpoints: EndpointNode[];
  groups: GroupNode[];
  /** When the session's first call was made. */
  since: number;
  now: number;
}

function rollUp(
  endpoints: readonly EndpointNode[],
  ctx: NodeContext,
): { metrics: EndpointMetrics; level: HealthLevel } {
  const metrics = metricsOf(
    endpoints.flatMap((e) => e.requests),
    ctx.now,
    ctx.since,
  );
  return { metrics, level: levelOf(metrics, ctx.slowMs) };
}

function sourceOf(name: string, entry: Catalog[string], ctx: NodeContext): SourceNode {
  const own = new Map<string, EndpointNode[]>();
  for (const [groupName, group] of Object.entries(entry.groups)) {
    const endpoints = Object.entries(group.endpoints)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([method, def]) =>
        endpointOf(
          { source: name, group: groupName, method },
          group.prefix,
          entry.baseURL,
          def,
          ctx,
        ),
      );
    own.set(groupName, endpoints);
  }
  const loose = own.get("") ?? [];
  const groups = groupPaths(own.keys()).map((path) => groupOf(name, path, own, ctx, rollUp));
  const endpoints = [...groups.flatMap((g) => g.endpoints), ...loose];
  return { name, baseURL: entry.baseURL, groups, loose, endpoints, ...rollUp(endpoints, ctx) };
}

/**
 * The Explorer's model: every source, group and endpoint the project
 * defines, each with this session's calls, their metrics and its health —
 * the sources with the most endpoints first.
 *
 * @param catalog - The project's definitions
 * @param requests - The session's requests, newest first
 * @param now - The time now
 * @param slowMs - Studio's slow-request threshold
 * @returns The model
 * @example
 * ```ts
 * explorerModelOf(catalog, requests, Date.now(), 500).sources[0]?.name; // "api"
 * ```
 */
export function explorerModelOf(
  catalog: Catalog,
  requests: readonly RequestEntry[],
  now: number,
  slowMs: number,
): ExplorerModel {
  const byKey = new Map<string, RequestEntry[]>();
  for (const r of requests) {
    const key = endpointKeyOf(r);
    const calls = byKey.get(key);
    if (calls) calls.push(r);
    else byKey.set(key, [r]);
  }
  const since = requests.reduce((first, r) => Math.min(first, r.startedAt), now);
  const ctx = { byKey, now, since, slowMs };
  const sources = Object.entries(catalog)
    .map(([name, entry]) => sourceOf(name, entry, ctx))
    .sort((a, b) => b.endpoints.length - a.endpoints.length || a.name.localeCompare(b.name));
  return {
    sources,
    endpoints: sources.flatMap((s) => s.endpoints),
    groups: sources.flatMap((s) => s.groups),
    since,
    now,
  };
}
