import type { Context as HonoContext } from "hono";

import { sleep } from "../backend/resolve-delay";
import type { NetworkConfig } from "../types";
import type { ElsewhereAnswer } from "./elsewhere";
import { forwardedHeaders } from "./forwarded-headers";
import { computeBandwidthDelay, resolveDelay } from "./route-network";
import { buildResponse, pushHistory } from "./route-response";
import type { RouteConfig } from "./route-types";

/** The call being answered, as the mock's request handler has it. */
export interface ElsewhereRequest {
  requestId: string;
  group: string;
  method: string;
  variables: unknown;
  /** Answer a success with `{ status, headers, data }`, as a proxy answers a `.raw` call */
  raw: boolean;
  /** When the request arrived, from `performance.now()` */
  start: number;
  /** The network conditions in force for the call: its delay and bandwidth cap apply as to any answer */
  network?: NetworkConfig | undefined;
}

/**
 * Answer a call the mock does not answer itself: an endpoint it leaves to
 * the source's own server is passed to it; one it answers with recordings
 * gets the recorded answer, or — the first time — the server's, recorded.
 * An override or a scenario on an endpoint answered with recordings wins
 * over them. A server that cannot be reached is a 502 that says so. The
 * mock's network conditions delay the answer and cap its bandwidth, as
 * they do an answer the mock makes itself.
 *
 * @param c - The request
 * @param request - The call, and how to answer it
 * @param config - The mock's routes
 * @returns The answer, or `null` when the mock answers the call itself
 * @example
 * ```ts
 * const elsewhere = await answerElsewhere(c, { requestId, group, method, variables, raw, start }, config);
 * if (elsewhere) return elsewhere;
 * ```
 */
export async function answerElsewhere(
  c: HonoContext,
  request: ElsewhereRequest,
  config: RouteConfig,
): Promise<Response | null> {
  const { elsewhere } = config;
  if (!elsewhere) return null;
  const { group, method, variables } = request;
  const headers = forwardedHeaders(c.req.raw.headers);
  if (elsewhere.passes(group, method)) {
    return send(c, request, config, () =>
      elsewhere.ask({ group, method, variables, headers, record: false }),
    );
  }
  if (!elsewhere.replays(group, method) || config.answersOwn?.(group, method)) return null;
  return send(c, request, config, async () => {
    const recorded = elsewhere.recorded(group, method, variables);
    return recorded ?? elsewhere.ask({ group, method, variables, headers, record: true });
  });
}

async function send(
  c: HonoContext,
  request: ElsewhereRequest,
  config: RouteConfig,
  answer: () => Promise<ElsewhereAnswer>,
): Promise<Response> {
  const { requestId, group, method, variables, start, network } = request;
  const delay = resolveDelay({}, network) ?? 0;
  if (delay) await sleep(delay);
  let got: ElsewhereAnswer;
  try {
    got = await answer();
  } catch (error) {
    const name = group ? `${group}.${method}` : method;
    const why = error instanceof Error ? error.message : String(error);
    const message = `The mock passes ${name} to its source's server, which could not be reached: ${why}`;
    pushHistory(config, {
      group,
      method,
      variables,
      start,
      status: 502,
      error: message,
      mocked: false,
    });
    config.networkState?.trackRequest(performance.now() - start, true);
    config.hooks?.onError?.(requestId, 502, message, performance.now() - start);
    return c.json({ error: message }, 502);
  }
  const { status, data, headers } = got;
  const throttle = computeBandwidthDelay(network?.bandwidth, data);
  if (throttle) await sleep(throttle);
  const duration = performance.now() - start;
  pushHistory(config, {
    group,
    method,
    variables,
    start,
    status,
    data,
    mocked: got.from === "recording",
  });
  config.networkState?.trackRequest(duration, status >= 400);
  const injected = delay + throttle;
  config.hooks?.onEnd?.(
    requestId,
    status,
    data,
    duration,
    injected,
    config.getScenarioState(),
    headers,
  );
  return buildResponse(c, { isError: status >= 400, status, headers }, status, data, request.raw);
}
