import type { HttpResponse } from "@noverax/courier";
import type { AnyDefinedApi, CourierRoutes } from "@noverax/courier/define";
import {
  createDirectHTTPExecutor,
  createProxyHTTPExecutor,
  fillPathParams,
  routesOf,
  withoutTrailingSlashes,
} from "@noverax/courier/internal";

import { analyzeRoutes, getSourceGroupNames } from "../auto/route-analyzer";
import type { RouteInfo } from "../auto/route-types";
import { prop } from "../auto/schema-introspect/prop";
import type { RecorderConfig } from "./recorder-types";

/** How the recorder reaches the backend it records */
export interface RecordingTransport {
  /**
   * Make a call and resolve to the whole response. A failed call rejects as
   * a real client's does, with an `HTTPError`.
   */
  call(
    group: string,
    method: string,
    variables: unknown,
    options: Record<string, unknown>,
  ): Promise<HttpResponse>;
  /** The HTTP request a call becomes */
  describe(group: string, method: string, variables: unknown): { method: string; url: string };
}

/**
 * The transport a recorder config names: the source's endpoints called
 * directly, at `targetUrl` or the source's own `baseURL`, or through a
 * Courier proxy route when `proxy` is set. Either way the calls go through
 * the same executors `createCaller` and `createProxyCaller` use.
 *
 * @param config The recorder's config
 * @returns The transport
 * @example
 * ```ts
 * const transport = createRecordingTransport({ source: api, targetUrl: "https://staging.example" });
 * const response = await transport.call("users", "getById", { id: 1 }, {});
 * ```
 */
export function createRecordingTransport(
  config: RecorderConfig<AnyDefinedApi>,
): RecordingTransport {
  const { proxy } = config;
  if (proxy) {
    const routes = routesOf(config.source, proxy.source);
    const execute = createProxyHTTPExecutor(proxy.source, {
      proxyPath: { http: proxy.url },
      routes,
    });
    const asGet = cachedReads(routes);
    return {
      call: async (group, method, variables, options) =>
        asResponse(await execute(group, method, variables, options, true)),
      describe: (group, method) => ({
        method: asGet.has(group ? `${group}.${method}` : method) ? "GET" : "POST",
        url: proxyUrl(proxy, group, method),
      }),
    };
  }

  const baseURL = withoutTrailingSlashes(config.targetUrl ?? baseUrlOf(config.source));
  const target = config.targetUrl
    ? { ...config.source, options: { ...config.source.options, baseURL } }
    : config.source;
  const execute = createDirectHTTPExecutor(target);
  const routes = routeTable(config.source);
  return {
    call: async (group, method, variables, options) =>
      asResponse(await execute(group, method, variables, options, true)),
    describe: (group, method, variables) => {
      const route = routes.get(`${group}/${method}`);
      if (!route) return { method: "POST", url: baseURL };
      return { method: route.httpMethod, url: `${baseURL}${fillPath(route.fullPath, variables)}` };
    },
  };
}

/* The proxy route names the call in its query, as the proxy caller sends it. */
/* The reads a proxy client sends as GET, its variables in the address: those that may be cached. */
function cachedReads({ endpoints }: CourierRoutes): ReadonlySet<string> {
  const shapes: ReadonlyArray<[string, unknown]> = Object.entries(endpoints);
  return new Set(shapes.filter(([, shape]) => prop(shape, "get") === true).map(([path]) => path));
}

function proxyUrl(proxy: { url: string; source: string }, group: string, method: string): string {
  const routing = new URLSearchParams(
    group ? { _s: proxy.source, _g: group, _m: method } : { _s: proxy.source, _m: method },
  );
  return `${proxy.url}${proxy.url.includes("?") ? "&" : "?"}${routing}`;
}

function baseUrlOf(source: AnyDefinedApi): string {
  const baseURL = prop(source, "options", "baseURL");
  return typeof baseURL === "string" ? baseURL : "";
}

/** Routes by the `group/method` a client call names; a top-level endpoint has no group */
function routeTable(source: AnyDefinedApi): Map<string, RouteInfo> {
  const groups = getSourceGroupNames(source);
  const table = new Map<string, RouteInfo>();
  for (const route of analyzeRoutes(source)) {
    const group = groups.has(route.group) ? route.group : "";
    table.set(`${group}/${route.endpoint}`, route);
  }
  return table;
}

/* The path a call went to, a parameter it gave no value for left as `:name`. */
function fillPath(path: string, variables: unknown): string {
  return fillPathParams(path, (name) => {
    const value = prop(variables, name);
    return typeof value === "string" || typeof value === "number"
      ? encodeURIComponent(String(value))
      : `:${name}`;
  });
}

/* A raw call answers `{ status, headers, data }`; anything else means the
   executor broke its contract, which no recording should paper over. */
function asResponse(value: unknown): HttpResponse {
  const status = prop(value, "status");
  const headers = prop(value, "headers");
  if (typeof status !== "number" || !(headers instanceof Headers)) {
    throw new TypeError("[courier-mock/recorder] A raw call answered without a status and headers");
  }
  return { status, headers, data: prop(value, "data") };
}
