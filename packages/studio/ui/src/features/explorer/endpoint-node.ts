import { withoutTrailingSlashes } from "@noverax/courier/internal";

import { joinPath } from "@/lib/join-path";
import type { CatalogEndpoint, RequestEntry } from "@/store/types";
import type { EndpointRef } from "./endpoint-key";
import { endpointKey } from "./endpoint-key";
import { levelOf, metricsOf } from "./endpoint-metrics";
import type { EndpointNode } from "./explorer-model";

function methodOf(def: CatalogEndpoint, calls: readonly RequestEntry[]): string {
  return (
    def.httpMethod ??
    calls.find((r) => r.httpMethod)?.httpMethod ??
    (def.type === "mutation" ? "POST" : "GET")
  ).toUpperCase();
}

/* The path of the newest call that has a URL Studio can read, under its source's base URL. */
function lastCalledPath(calls: readonly RequestEntry[], baseURL: string): string | null {
  const url = calls.find((call) => call.url !== undefined && URL.canParse(call.url))?.url;
  if (url === undefined) return null;
  const path = new URL(url).pathname;
  const base = URL.canParse(baseURL) ? withoutTrailingSlashes(new URL(baseURL).pathname) : "";
  if (base === "" || (path !== base && !path.startsWith(`${base}/`))) return path;
  return path.slice(base.length) || "/";
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
 * middleware, schemas — with its calls, their metrics and its health. An
 * endpoint only traffic showed, whose path nothing declares, shows the path
 * it was last called at — even in a group the config declares, whose prefix
 * says nothing of where an endpoint it does not declare is served.
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
  const path =
    (def.origin === "runtime" && lastCalledPath(requests, baseURL)) ||
    joinPath(prefix, def.path ?? "");
  return {
    ...ref,
    key,
    httpMethod: methodOf(def, requests),
    transport: def.transport ?? "http",
    type: def.type,
    path,
    url: `${withoutTrailingSlashes(baseURL)}${path}`,
    middleware: def.middleware ?? [],
    hasVariablesSchema: def.hasVariablesSchema,
    hasResponseSchema: def.hasResponseSchema,
    trafficOnly: def.origin === "runtime",
    proxied: requests.some((r) => r.mode === "proxy"),
    ...(def.agent && { agent: def.agent }),
    ...(def.page && { page: def.page }),
    requests,
    metrics,
    level: levelOf(metrics, ctx.slowMs),
  };
}
