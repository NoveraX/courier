import type { HttpResponse } from "@noverax/courier";
import type { AnyDefinedApi } from "@noverax/courier/define";
import {
  createDirectHTTPExecutor,
  createProxyHTTPExecutor,
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
    const execute = createProxyHTTPExecutor(proxy.source, {
      proxyPath: { http: proxy.url },
      source: config.source,
    });
    return {
      call: async (group, method, variables, options) =>
        asResponse(await execute(group, method, variables, options, true)),
      describe: (group, method) => ({ method: "POST", url: proxyUrl(proxy, group, method) }),
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

const PATH_PARAM = /:(\w+)/g;

function fillPath(path: string, variables: unknown): string {
  return path.replace(PATH_PARAM, (match, name: string) => {
    const value = prop(variables, name);
    return typeof value === "string" || typeof value === "number"
      ? encodeURIComponent(String(value))
      : match;
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
