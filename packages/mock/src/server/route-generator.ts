/**
 * Mock request route generator — public entry point.
 *
 * Owns the request lifecycle for both the proxy route
 * (`POST /api/request`) and the REST-style routes (`/api/:group/:method`).
 * Supporting pieces live in siblings:
 *
 * - `route-types`    — `RouteConfig`, `RequestHooks`
 * - `route-network`  — failure/latency/bandwidth resolution
 * - `route-response` — response shaping + history recording
 */

import { randomUUID } from "node:crypto";

import type { Hono, Context as HonoContext } from "hono";

import { createFaultError, pickFault, shouldFail } from "../network/failure";
import type { MockRequestContext } from "../types";
import { computeBandwidthDelay, resolveDelay, resolveNetConfig } from "./route-network";
import { buildResponse, handlerFailure, pushHistory } from "./route-response";
import type { RouteConfig } from "./route-types";
import { handleSSEMock } from "./sse-handler";

export type { RequestHooks, RouteConfig } from "./route-types";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Register the main courier proxy route: POST /api/request */
export function registerProxyRoute(app: Hono, config: RouteConfig): void {
  app.post("/api/request", async (c: HonoContext) => {
    const body = await c.req.json<{
      source?: string;
      group?: string;
      method?: string;
      variables?: unknown;
      options?: { rawData?: unknown };
    }>();
    const { group = "", method = "" } = body;
    // A `.raw` call is answered with the response around the data, as a Courier proxy does
    const raw = body.options?.rawData === true;

    return handleMockRequest(c, group, method, body.variables, config, raw);
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
  raw = false,
): Promise<Response> {
  const start = performance.now();
  const requestId = `req_${randomUUID()}`;
  const httpMethod = c.req.method;
  const path = new URL(c.req.url).pathname;
  const key = `${group}/${method}`;
  const index = config.callCounts.get(key) ?? 0;
  config.callCounts.set(key, index + 1);

  const reqHeaders = Object.fromEntries(c.req.raw.headers);
  config.hooks?.onStart?.(requestId, httpMethod, path, group, method, variables, reqHeaders);

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

  const delay = resolveDelay(handler, netConfig);
  if (delay) await sleep(delay);

  const ctx: MockRequestContext = {
    variables,
    headers: new Headers(Object.fromEntries(c.req.raw.headers)),
    callIndex: index,
    scenarioState,
  };

  // SSE stream — bypass normal JSON response path
  if (handler.transport === "sse") {
    pushHistory(config, { group, method, variables, start, status: 200, stream: true });
    return handleSSEMock(c, handler, ctx);
  }

  try {
    const data = await handler.fn(ctx);

    if (handler.newState) {
      config.setScenarioState(handler.newState);
    }

    const status = handler.isError ? handler.status : handler.status || 200;

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

    return buildResponse(c, handler, status, data, raw);
  } catch (err) {
    const duration = performance.now() - start;
    config.networkState?.trackRequest(duration, true);
    const { status, body, message } = handlerFailure(err);
    pushHistory(config, { group, method, variables, start, status, error: message });
    config.hooks?.onError?.(requestId, status, message, duration);
    return c.json(body, status as 500);
  }
}
