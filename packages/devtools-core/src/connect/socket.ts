import { executeRequest } from "@noverax/nexus";
import type { Sources } from "@noverax/nexus/define";
import type { EventBus } from "../event-bus";
import type { SourceMap } from "../events";

/** Try to connect via Socket.IO (fails silently if not installed) */
export async function tryConnectSocket(
  bus: EventBus,
  sessionId: string,
  host: string,
  port: number,
  framework: string,
  nexusVersion: string,
  sourceMap?: SourceMap,
  sources?: Sources,
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
        timestamp: performance.now(),
        sessionId,
        framework,
        nexusVersion,
        sources: sourceMap ?? {},
      });
    });

    // Forward all bus events to Socket.IO
    const unsubscribe = bus.on((event) => {
      socket.emit("event", event);
    });

    // Playground: execute endpoint on behalf of DevTools UI
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
        handlePlaygroundExecute(sources, payload, callback);
      },
    );

    return () => {
      unsubscribe();
      socket.disconnect();
    };
  } catch {
    // socket.io-client not installed — run in local-only mode
    return undefined;
  }
}

/** Handle playground:execute requests from DevTools UI */
function handlePlaygroundExecute(
  sources: Sources | undefined,
  payload: {
    source: string;
    group: string;
    method: string;
    variables: unknown;
    headers: Record<string, string>;
    mode: "direct" | "proxy";
  },
  callback: (result: Record<string, unknown>) => void,
): void {
  if (!sources) {
    callback({
      error: "No sources provided to connectDevTools — cannot execute endpoints",
      status: 0,
      headers: {},
    });
    return;
  }

  const startTime = performance.now();

  // createCaller() uses "_" as the internal source key, but connectDevTools
  // receives the user's sources object with real keys. Resolve unknown
  // source keys by matching group, or falling back to the first source.
  let resolvedSource = payload.source;
  if (!Object.hasOwn(sources, resolvedSource)) {
    const keys = Object.keys(sources);
    // Try to find a source that has the requested group
    const match = payload.group
      ? keys.find((k) => {
          const s = sources[k];
          return s?.options?.groups && payload.group in s.options.groups;
        })
      : undefined;
    resolvedSource = match ?? keys[0] ?? resolvedSource;
  }

  executeRequest(sources, {
    source: resolvedSource,
    group: payload.group,
    method: payload.method,
    variables: payload.variables as Record<string, unknown>,
    options: {
      headers: payload.headers,
    },
  })
    .then((data) => {
      callback({
        status: 200,
        data,
        headers: {},
        duration: performance.now() - startTime,
      });
    })
    .catch((err: unknown) => {
      const error = err as { status?: number; message?: string; data?: { message?: string } };
      const detail = error.data?.message ?? error.message ?? "Unknown error";
      callback({
        error: detail,
        status: error.status ?? 500,
        headers: {},
        duration: performance.now() - startTime,
      });
    });
}
