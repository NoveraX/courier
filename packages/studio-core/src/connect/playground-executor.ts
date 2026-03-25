import { createProxyCallerFn, executeRequest } from "@noverax/nexus";
import type { Sources } from "@noverax/nexus/define";
import type { EventBus } from "../event-bus";
import { resolveSource } from "./socket-utils";

export interface PlaygroundPayload {
  source: string;
  group: string;
  method: string;
  variables: unknown;
  headers: Record<string, string>;
  mode: "direct" | "proxy";
}

export type PlaygroundCallback = (result: Record<string, unknown>) => void;

/** Route playground execution to direct or proxy handler */
export async function handlePlaygroundExecute(
  bus: EventBus,
  sources: Sources | undefined,
  payload: PlaygroundPayload,
  callback: PlaygroundCallback,
): Promise<void> {
  if (payload.mode === "proxy") {
    await handleProxyViaFetch(payload, callback);
    return;
  }
  await handleDirectExecute(bus, sources, payload, callback);
}

/** Direct mode: call executeRequest on current process, capture result from bus */
async function handleDirectExecute(
  bus: EventBus,
  sources: Sources | undefined,
  payload: PlaygroundPayload,
  callback: PlaygroundCallback,
): Promise<void> {
  if (!sources) {
    callback({ error: "No sources registered — cannot execute", status: 0, headers: {} });
    return;
  }

  const startTime = performance.now();
  const resolvedSource = resolveSource(sources, payload.source, payload.group);

  const captured: {
    status: number;
    headers: Record<string, string>;
    requestHeaders: Record<string, string>;
    timing: { total: number; middleware: number; fetch: number; validation: number } | undefined;
  } = { status: 200, headers: {}, requestHeaders: {}, timing: undefined };

  const unsub = bus.on("request:end", (event) => {
    const e = event as unknown as Record<string, unknown>;
    captured.status = (e.status as number) ?? 200;
    captured.headers = (e.headers as Record<string, string>) ?? {};
    captured.requestHeaders = (e.requestHeaders as Record<string, string>) ?? {};
    captured.timing = e.timing as typeof captured.timing;
  });

  try {
    const data = await executeRequest(sources, {
      source: resolvedSource,
      group: payload.group,
      method: payload.method,
      variables: payload.variables as Record<string, unknown>,
      options: { headers: payload.headers },
    });

    unsub();

    callback({
      status: captured.status,
      data,
      headers: captured.headers,
      requestHeaders: captured.requestHeaders,
      timing: captured.timing,
      duration: performance.now() - startTime,
    });
  } catch (err: unknown) {
    unsub();
    const error = err as { status?: number; message?: string; data?: { message?: string } };
    callback({
      error: error.data?.message ?? error.message ?? "Unknown error",
      status: error.status ?? 500,
      headers: {},
      timing: captured.timing,
      duration: performance.now() - startTime,
    });
  }
}

/**
 * Proxy mode: use createProxyCallerFn to go through the real Nexus proxy flow.
 * Browser → POST /api/request → server executeRequest → backend.
 * All studio hooks fire (both browser and server side), producing full
 * timing data including client↔proxy leg.
 */
async function handleProxyViaFetch(
  payload: PlaygroundPayload,
  callback: PlaygroundCallback,
): Promise<void> {
  const startTime = performance.now();

  try {
    const callerFn = createProxyCallerFn({ headers: payload.headers }) as (
      source: string,
      options?: Record<string, unknown>,
    ) => (...args: [string] | [string, Record<string, unknown>]) => Promise<unknown>;

    const endpointKey = payload.group ? `${payload.group}:${payload.method}` : payload.method;
    const execute = callerFn(payload.source);
    const data = payload.variables
      ? await execute(endpointKey, payload.variables as Record<string, unknown>)
      : await execute(endpointKey);

    callback({
      status: 200,
      data,
      headers: {},
      duration: performance.now() - startTime,
    });
  } catch (err: unknown) {
    const error = err as { status?: number; message?: string; data?: { message?: string } };
    callback({
      error: error.data?.message ?? error.message ?? "Proxy request failed",
      status: error.status ?? 500,
      headers: {},
      duration: performance.now() - startTime,
    });
  }
}
