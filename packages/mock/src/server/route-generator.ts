/**
 * The mock request lifecycle, shared by every route that answers a mocked
 * endpoint — the proxy routes and REST-style routes in `api-routes`, and the
 * prefix routes. Supporting pieces live in siblings:
 *
 * - `route-types`    — `RouteConfig`, `RequestHooks`
 * - `route-network`  — failure/latency/bandwidth resolution
 * - `route-response` — response shaping + history recording
 */

import { randomUUID } from "node:crypto";

import type { Context as HonoContext } from "hono";

import { pickFault, shouldFail } from "../network/failure";
import type { MockRequestContext } from "../types";
import { answerFault } from "./fault-response";
import { computeBandwidthDelay, resolveDelay, resolveNetConfig } from "./route-network";
import { buildResponse, handlerFailure, pushHistory } from "./route-response";
import type { RouteConfig } from "./route-types";
import { handleSSEMock } from "./sse-handler";

export type { RequestHooks, RouteConfig } from "./route-types";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** How a route wants a request answered */
export interface AnswerOptions {
  /** Answer a success with `{ status, headers, data }`, as a proxy answers a `.raw` call */
  raw?: boolean;
  /** Serve only an endpoint mocked as a stream; any other is refused with 404 */
  stream?: boolean;
}

/** Core handler: resolve mock → apply network simulation → return response */
export async function handleMockRequest(
  c: HonoContext,
  group: string,
  method: string,
  variables: unknown,
  config: RouteConfig,
  { raw = false, stream = false }: AnswerOptions = {},
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
    return answerFault(c, pickFault(netConfig), netConfig, (status, message) => {
      const duration = performance.now() - start;
      pushHistory(config, { group, method, variables, start, status, error: message });
      config.networkState?.trackRequest(duration, true);
      config.hooks?.onError?.(requestId, status, message, duration);
    });
  }

  const mark = config.markScenario();
  const scenarioState = mark.state;
  const handler = config.registry.get(group, method, scenarioState);

  if (!handler || (stream && handler.transport !== "sse")) {
    const duration = performance.now() - start;
    pushHistory(config, { group, method, variables, start, status: 404, error: "No mock" });
    config.hooks?.onError?.(requestId, 404, "No mock", duration);
    const kind = stream ? "stream mock" : "mock";
    return c.json(
      { error: `No ${kind} for "${group}.${method}" in state "${scenarioState}"` },
      404,
    );
  }

  const delay = resolveDelay(handler, netConfig);
  if (delay) await sleep(delay);

  const ctx: MockRequestContext = {
    variables,
    headers: new Headers(Object.fromEntries(c.req.raw.headers)),
    callIndex: index,
    scenarioState,
  };

  // SSE stream — bypass normal JSON response path; logged as finished once it has ended
  if (handler.transport === "sse") {
    pushHistory(config, { group, method, variables, start, status: 200, stream: true });
    return handleSSEMock(c, handler, ctx, ({ events, error }) => {
      const duration = performance.now() - start;
      config.networkState?.trackRequest(duration, error !== undefined);
      if (error !== undefined) return config.hooks?.onError?.(requestId, 500, error, duration);
      const state = config.getScenarioState();
      config.hooks?.onEnd?.(
        requestId,
        200,
        { events },
        duration,
        delay ?? 0,
        state,
        handler.headers,
      );
    });
  }

  try {
    const data = await handler.fn(ctx);

    if (handler.newState) config.transitionScenario(mark, handler.newState);

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
