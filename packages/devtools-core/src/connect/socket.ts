import { createProxyCallerFn, executeRequest } from "@noverax/nexus";
import type { Sources } from "@noverax/nexus/define";
import type { EventBus } from "../event-bus";
import type { SourceMap } from "../events";
import { extractSourceMap } from "../source-map";
import { getSources, onSourcesChange, renameSourceKeys } from "../sources-registry";

/** Try to connect via Socket.IO (fails silently if not installed) */
export async function tryConnectSocket(
  bus: EventBus,
  sessionId: string,
  host: string,
  port: number,
  framework: string,
  nexusVersion: string,
  sourceMap?: SourceMap,
): Promise<(() => void) | undefined> {
  try {
    const { io } = await import("socket.io-client");
    const url = `http://${host}:${port}`;
    const socket = io(`${url}/app`, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    socket.on("connect", () => {
      socket.emit("event", {
        id: sessionId,
        type: "connection:init",
        timestamp: Date.now(),
        sessionId,
        framework,
        nexusVersion,
        sources: sourceMap ?? {},
      });
    });

    const heartbeatInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit("event", {
          id: sessionId,
          type: "connection:heartbeat",
          timestamp: Date.now(),
          sessionId,
        });
      }
    }, 30_000);

    const unsubBus = bus.on((event) => {
      socket.emit("event", event);
    });

    const unsubSources = onSourcesChange((newSources) => {
      if (!socket.connected) return;
      socket.emit("event", {
        id: sessionId,
        type: "connection:sources",
        timestamp: Date.now(),
        sessionId,
        sources: extractSourceMap(newSources),
      });
    });

    // Playground: execute endpoint, capture result from bus events
    socket.on(
      "playground:execute",
      (
        payload: {
          source: string;
          group: string;
          method: string;
          variables: unknown;
          headers: Record<string, string>;
          mode: "direct" | "proxy";
        },
        callback: (result: Record<string, unknown>) => void,
      ) => {
        handlePlaygroundExecute(bus, getSources(), payload, callback);
      },
    );

    socket.on("catalog:names", (mapping: Record<string, string>) => {
      renameSourceKeys(mapping);
    });

    return () => {
      clearInterval(heartbeatInterval);
      unsubBus();
      unsubSources();
      socket.disconnect();
    };
  } catch {
    return undefined;
  }
}

// ── Playground execution ────────────────────────────────────────────────────

interface PlaygroundPayload {
  source: string;
  group: string;
  method: string;
  variables: unknown;
  headers: Record<string, string>;
  mode: "direct" | "proxy";
}

type PlaygroundCallback = (result: Record<string, unknown>) => void;

async function handlePlaygroundExecute(
  bus: EventBus,
  sources: Sources | undefined,
  payload: PlaygroundPayload,
  callback: PlaygroundCallback,
): Promise<void> {
  if (payload.mode === "proxy") {
    await handleProxyViaFetch(bus, payload, callback);
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
 * All devtools hooks fire (both browser and server side), producing full
 * timing data including client↔proxy leg. Headers and timing are picked up
 * from the store via pollForTiming on the UI side.
 */
async function handleProxyViaFetch(
  _bus: EventBus,
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

function resolveSource(sources: Sources, source: string, group: string): string {
  if (Object.hasOwn(sources, source)) return source;
  const keys = Object.keys(sources);
  const hasGroup = group !== undefined && group !== "";
  const match = hasGroup
    ? keys.find((k) => {
        const s = sources[k];
        return s?.options?.groups && group in s.options.groups;
      })
    : keys[0];
  return match ?? keys[0] ?? source;
}
