import type { CatalogEndpoint, RequestEntry } from "@/store/types";
import type { EndpointRef } from "./endpoint-key";
import { endpointKey } from "./endpoint-key";
import { levelOf, metricsOf } from "./endpoint-metrics";
import type { EndpointNode } from "./explorer-model";

/* A path joined from a group's prefix and an endpoint's own path, with single slashes. */
function joinPath(prefix: string, path: string): string {
  const joined = [prefix, path]
    .map((p) => p.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
  return `/${joined}`;
}

function methodOf(def: CatalogEndpoint, calls: readonly RequestEntry[]): string {
  return (
    def.httpMethod ??
    calls.find((r) => r.httpMethod)?.httpMethod ??
    (def.type === "mutation" ? "POST" : "GET")
  ).toUpperCase();
}

/** What building an endpoint's node reads beside its definition. */
export interface NodeContext {
  byKey: Map<string, RequestEntry[]>;
  now: number;
  since: number;
  slowMs: number;
}

/**
 * An endpoint's node: its definition — method, transport, path and URL,
 * middleware, schemas — with its calls, their metrics and its health.
 *
 * @param ref - Where the endpoint is
 * @param prefix - Its group's path prefix
 * @param baseURL - Its source's base URL
 * @param def - Its definition
 * @param ctx - The calls by endpoint, the times and the slow threshold
 * @returns The node
 * @example
 * ```ts
 * endpointOf({ source: "api", group: "orders", method: "create" }, "/orders", "https://api.example.com", def, ctx);
 * ```
 */
export function endpointOf(
  ref: EndpointRef,
  prefix: string,
  baseURL: string,
  def: CatalogEndpoint,
  ctx: NodeContext,
): EndpointNode {
  const key = endpointKey(ref);
  const requests = ctx.byKey.get(key) ?? [];
  const metrics = metricsOf(requests, ctx.now, ctx.since);
  const path = joinPath(prefix, def.path ?? "");
  return {
    ...ref,
    key,
    httpMethod: methodOf(def, requests),
    transport: def.transport ?? "http",
    type: def.type,
    path,
    url: `${baseURL.replace(/\/+$/, "")}${path}`,
    middleware: def.middleware ?? [],
    hasVariablesSchema: def.hasVariablesSchema,
    hasResponseSchema: def.hasResponseSchema,
    proxied: requests.some((r) => r.mode === "proxy"),
    requests,
    metrics,
    level: levelOf(metrics, ctx.slowMs),
  };
}
