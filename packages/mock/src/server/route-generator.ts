/**
 * The mock request lifecycle, shared by every route that answers a mocked
 * endpoint — the proxy routes and REST-style routes in `api-routes`, and the
 * prefix routes. Its types are in `route-types`, the network conditions in
 * `route-network`, the answer and its history in `route-response`, and the
 * request's id, arrival and fault in `request-call`.
 */

import type { Context as HonoContext } from "hono";

import { sleep } from "../backend/resolve-delay";
import { resolveDelay } from "../network/latency";
import type { MockRequestContext } from "../types";
import { answerElsewhere } from "./answer-elsewhere";
import { answerFault } from "./fault-response";
import { callOf, faultOf } from "./request-call";
import { requestTarget } from "./request-target";
import { computeBandwidthDelay, resolveNetConfig } from "./route-network";
import { buildResponse, handlerFailure, pushHistory } from "./route-response";
import type { RouteConfig } from "./route-types";
import { handleSSEMock } from "./sse-handler";

/** How a route wants a request answered */
export interface AnswerOptions {
  /** Answer a success with `{ status, headers, data }`, as a proxy answers a `.raw` call */
  raw?: boolean;
  /** Serve only an endpoint mocked as a stream; any other is refused with 404 */
  stream?: boolean;
}

/**
 * Core handler: resolve mock → apply network simulation → return response,
 * under the id, arrival and fault the request was given as it came.
 */
export async function handleMockRequest(
  c: HonoContext,
  group: string,
  method: string,
  variables: unknown,
  config: RouteConfig,
  { raw = false, stream = false }: AnswerOptions = {},
): Promise<Response> {
  const { id: requestId, start } = callOf(c.req.raw);
  const httpMethod = c.req.method;
  const path = requestTarget(c.req.url);
  const key = `${group}/${method}`;
  const index = config.callCounts.get(key) ?? 0;
  config.callCounts.set(key, index + 1);

  const reqHeaders = Object.fromEntries(c.req.raw.headers);
  config.hooks?.onStart?.(requestId, httpMethod, path, group, method, variables, reqHeaders);

  const netConfig = resolveNetConfig(config, group, method);

  // Random network failure injection
  const fault = faultOf(c.req.raw, netConfig);
  if (netConfig && fault !== undefined) {
    return answerFault(c, fault, netConfig, (status, message) => {
      const duration = performance.now() - start;
      pushHistory(config, { group, method, variables, start, status, error: message });
      config.networkState?.trackRequest(duration, true);
      config.hooks?.onError?.(requestId, status, message, duration);
    });
  }

  const elsewhere = await answerElsewhere(
    c,
    { requestId, group, method, variables, raw, start, network: netConfig },
    config,
  );
  if (elsewhere) return elsewhere;

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
    return handleSSEMock(c, handler, ctx, config.streamsStopping?.(), ({ events, error }) => {
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
    const run = async () => {
      const result = await handler.fn(ctx);
      if (handler.newState) config.transitionScenario(mark, handler.newState);
      return { data: result, status: handler.isError ? handler.status : handler.status || 200 };
    };
    /* A read is answered afresh whatever it carries; a write under a key, once. */
    const keyed =
      config.idempotency && c.req.method !== "GET" && c.req.method !== "HEAD"
        ? await config.idempotency.answer(c.req.raw.headers, { group, method, variables }, run)
        : { ...(await run()), replayed: false };
    const { data, status } = keyed;

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

    const response = buildResponse(c, handler, status, data, raw);
    if (keyed.replayed) response.headers.set("Idempotent-Replayed", "true");
    return response;
  } catch (err) {
    const duration = performance.now() - start;
    config.networkState?.trackRequest(duration, true);
    const { status, body, message } = handlerFailure(err);
    pushHistory(config, { group, method, variables, start, status, error: message });
    config.hooks?.onError?.(requestId, status, message, duration);
    return c.json(body, status as 500);
  }
}
