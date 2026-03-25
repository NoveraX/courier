import type { Hono, Context as HonoContext } from "hono";
import { createFaultError, pickFault, shouldFail } from "../network/failure";
import { resolveLatency } from "../network/latency";
import type { NetworkState } from "../network/state";
import type { MockRegistry } from "../registry";
import type {
  LatencyDistribution,
  LatencyProfile,
  MockHistoryEntry,
  MockRequestContext,
  NetworkConfig,
} from "../types";
import { isMockHttpError } from "./errors";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Hooks for emitting request lifecycle events (set by devtools bridge) */
export interface RequestHooks {
  onStart?(
    id: string,
    httpMethod: string,
    path: string,
    group: string,
    endpoint: string,
    variables?: unknown,
    requestHeaders?: Record<string, string>,
  ): void;
  onEnd?(
    id: string,
    status: number,
    data: unknown,
    duration: number,
    latencyInjected: number,
    scenarioState: string,
    responseHeaders?: Record<string, string>,
  ): void;
  onError?(id: string, status: number, message: string, duration: number): void;
}

export interface RouteConfig {
  registry: MockRegistry;
  history: MockHistoryEntry[];
  callCounts: Map<string, number>;
  getScenarioState: () => string;
  setScenarioState: (state: string) => void;
  network?: NetworkConfig;
  /** Dynamic network state — takes precedence over static `network` */
  networkState?: NetworkState;
  hooks?: RequestHooks;
}

/** Register the main nexus proxy route: POST /api/request */
export function registerProxyRoute(app: Hono, config: RouteConfig): void {
  app.post("/api/request", async (c: HonoContext) => {
    const body = await c.req.json<{
      source?: string;
      group?: string;
      method?: string;
      variables?: unknown;
    }>();
    const { group = "", method = "" } = body;

    return handleMockRequest(c, group, method, body.variables, config);
  });
}

/** Register REST-style routes: POST /api/:group/:method */
export function registerRestRoutes(app: Hono, config: RouteConfig): void {
  app.all("/api/:group/:method", async (c: HonoContext) => {
    const group = c.req.param("group") ?? "";
    const method = c.req.param("method") ?? "";
    const variables =
      c.req.method === "GET"
        ? Object.fromEntries(new URL(c.req.url).searchParams)
        : await c.req.json().catch(() => undefined);

    return handleMockRequest(c, group, method, variables, config);
  });
}

/** Core handler: resolve mock → apply network simulation → return response */
export async function handleMockRequest(
  c: HonoContext,
  group: string,
  method: string,
  variables: unknown,
  config: RouteConfig,
): Promise<Response> {
  const start = performance.now();
  const requestId = `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const httpMethod = c.req.method;
  const path = new URL(c.req.url).pathname;
  const key = `${group}/${method}`;
  const index = config.callCounts.get(key) ?? 0;
  config.callCounts.set(key, index + 1);

  const reqHeaders = Object.fromEntries(c.req.raw.headers);
  config.hooks?.onStart?.(requestId, httpMethod, path, group, method, variables, reqHeaders);

  // Resolve effective network config (dynamic state > static config)
  const netConfig = resolveNetConfig(config, group, method);

  // Random network failure injection
  if (netConfig && shouldFail(netConfig)) {
    const fault = pickFault(netConfig);
    const { status, message } = createFaultError(fault);
    const duration = performance.now() - start;
    pushHistory(config, { group, method, variables, start, status, error: message });
    config.networkState?.trackRequest(duration, true);
    config.hooks?.onError?.(requestId, status, message, duration);
    return c.json({ error: message }, status as 500);
  }

  const scenarioState = config.getScenarioState();
  const handler = config.registry.get(group, method, scenarioState);

  if (!handler) {
    const duration = performance.now() - start;
    pushHistory(config, { group, method, variables, start, status: 404, error: "No mock" });
    config.hooks?.onError?.(requestId, 404, "No mock", duration);
    return c.json({ error: `No mock for "${group}.${method}" in state "${scenarioState}"` }, 404);
  }

  // Apply latency delay
  const delay = resolveDelay(handler, netConfig);
  if (delay) await sleep(delay);

  const ctx: MockRequestContext = {
    variables,
    headers: new Headers(Object.fromEntries(c.req.raw.headers)),
    callIndex: index,
    scenarioState,
  };

  try {
    const data = await handler.fn(ctx);

    if (handler.newState) {
      config.setScenarioState(handler.newState);
    }

    const status = handler.isError ? handler.status : handler.status || 200;

    // Bandwidth throttling — simulate slower download based on response size
    const bwDelay = computeBandwidthDelay(netConfig?.bandwidth, data);
    if (bwDelay) await sleep(bwDelay);

    const duration = performance.now() - start;
    pushHistory(config, { group, method, variables, start, status, data });
    config.networkState?.trackRequest(duration, false);
    config.hooks?.onEnd?.(
      requestId,
      status,
      data,
      duration,
      (delay ?? 0) + bwDelay,
      config.getScenarioState(),
      handler.headers,
    );

    return buildResponse(c, handler, status, data);
  } catch (err) {
    const duration = performance.now() - start;
    config.networkState?.trackRequest(duration, true);
    if (isMockHttpError(err)) {
      pushHistory(config, {
        group,
        method,
        variables,
        start,
        status: err.status,
        error: err.message,
      });
      config.hooks?.onError?.(requestId, err.status, err.message, duration);
      return c.json({ error: err.message }, err.status as 404);
    }
    const message = err instanceof Error ? err.message : String(err);
    pushHistory(config, { group, method, variables, start, status: 500, error: message });
    config.hooks?.onError?.(requestId, 500, message, duration);
    return c.json({ error: message }, 500);
  }
}

/** Resolve effective NetworkConfig — dynamic state (with per-route) > static config */
function resolveNetConfig(
  config: RouteConfig,
  group: string,
  method: string,
): NetworkConfig | undefined {
  if (config.networkState) return config.networkState.getConfig(group, method);
  return config.network;
}

/** Resolve delay from handler-level or effective network config */
function resolveDelay(
  handler: { delayMs?: number; latency?: LatencyProfile },
  network?: NetworkConfig,
): number | undefined {
  const distribution = network?.distribution ?? "uniform";
  return (
    handler.delayMs ??
    (handler.latency ? resolveLatency(handler.latency, distribution) : undefined) ??
    resolveNetworkLatency(network, distribution)
  );
}

function resolveNetworkLatency(
  network: NetworkConfig | undefined,
  distribution: LatencyDistribution,
): number | undefined {
  if (!network?.latency) return undefined;
  const profile: LatencyProfile =
    typeof network.latency === "number"
      ? { min: network.latency, max: network.latency }
      : network.latency;
  return resolveLatency(profile, distribution);
}

/**
 * Simulate bandwidth throttling by adding delay proportional to response size.
 * bandwidth is in Kbps; returns delay in ms (0 = unlimited).
 */
function computeBandwidthDelay(bandwidth: number | undefined, data: unknown): number {
  if (!bandwidth || bandwidth <= 0) return 0;
  const json = JSON.stringify(data) ?? "";
  const bytes = new TextEncoder().encode(json).byteLength;
  const bitsPerMs = bandwidth; // Kbps = kilobits/sec = bits/ms
  return Math.round((bytes * 8) / bitsPerMs);
}

/** Build JSON response with error shape, Retry-After, and custom headers */
function buildResponse(
  c: HonoContext,
  handler: { isError: boolean; status: number; headers?: Record<string, string> },
  status: number,
  data: unknown,
): Response {
  const body = handler.isError ? { error: data } : data;
  const res = c.json(body, status as 200);

  if (handler.isError && (status === 429 || status === 503)) {
    const retryAfter = (data as Record<string, unknown>)?.retryAfter;
    if (typeof retryAfter === "number") {
      res.headers.set("Retry-After", String(retryAfter));
    }
  }

  if (handler.headers) {
    for (const [k, v] of Object.entries(handler.headers)) {
      res.headers.set(k, v);
    }
  }

  return res;
}

function pushHistory(
  config: RouteConfig,
  entry: {
    group: string;
    method: string;
    variables: unknown;
    start: number;
    status: number;
    data?: unknown;
    error?: string;
  },
): void {
  config.history.push({
    group: entry.group,
    method: entry.method,
    variables: entry.variables,
    mocked: true,
    duration: performance.now() - entry.start,
    timestamp: Date.now(),
    result: entry.error ? undefined : { status: entry.status, data: entry.data },
    error: entry.error ? new Error(entry.error) : undefined,
  });
}
