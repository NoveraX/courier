import type { Hono, Context as HonoContext } from "hono";
import { createFaultError, pickFault, shouldFail } from "../network/failure";
import { resolveLatency } from "../network/latency";
import type { MockRegistry } from "../registry";
import type { MockHistoryEntry, MockRequestContext, NetworkConfig } from "../types";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface RouteConfig {
  registry: MockRegistry;
  history: MockHistoryEntry[];
  callCounts: Map<string, number>;
  getScenarioState: () => string;
  setScenarioState: (state: string) => void;
  network?: NetworkConfig;
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

/** Core handler: resolve mock → apply network → return response */
async function handleMockRequest(
  c: HonoContext,
  group: string,
  method: string,
  variables: unknown,
  config: RouteConfig,
): Promise<Response> {
  const start = performance.now();
  const key = `${group}/${method}`;
  const index = config.callCounts.get(key) ?? 0;
  config.callCounts.set(key, index + 1);

  // Random network failure
  if (config.network && shouldFail(config.network)) {
    const fault = pickFault(config.network);
    const { status, message } = createFaultError(fault);
    pushHistory(config, { group, method, variables, start, status, error: message });
    return c.json({ error: message }, status as 500);
  }

  const scenarioState = config.getScenarioState();
  const handler = config.registry.get(group, method, scenarioState);

  if (!handler) {
    pushHistory(config, { group, method, variables, start, status: 404, error: "No mock" });
    return c.json({ error: `No mock for "${group}.${method}" in state "${scenarioState}"` }, 404);
  }

  // Apply delay
  const delay =
    handler.delayMs ??
    (handler.latency ? resolveLatency(handler.latency) : undefined) ??
    (config.network?.latency
      ? resolveLatency(
          typeof config.network.latency === "number"
            ? { min: config.network.latency, max: config.network.latency }
            : config.network.latency,
        )
      : undefined);

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
    pushHistory(config, { group, method, variables, start, status, data });

    return c.json(handler.isError ? { error: data } : data, status as 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    pushHistory(config, { group, method, variables, start, status: 500, error: message });
    return c.json({ error: message }, 500);
  }
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
