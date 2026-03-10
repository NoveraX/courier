import { devtoolsHooks } from "@noverax/nexus";
import { EventBus } from "./event-bus";
import type {
  AnyDevToolsEvent,
  HttpFetchEndEvent,
  HttpFetchStartEvent,
  MiddlewareEnterEvent,
  MiddlewareErrorEvent,
  MiddlewareExitEvent,
  ProxyReceiveEvent,
  ProxyRespondEvent,
  RequestEndEvent,
  RequestErrorEvent,
  RequestStartEvent,
  SourceMap,
  ValidationFailEvent,
  ValidationPassEvent,
  ValidationStartEvent,
} from "./events";

export interface ConnectDevToolsOptions {
  /** DevTools server port (default: 4380) */
  port?: number;
  /** DevTools server host (default: "localhost") */
  host?: string;
  /** Framework identifier for connection:init */
  framework?: string;
  /** Nexus version for connection:init */
  nexusVersion?: string;
  /** Source map for API Explorer */
  sources?: SourceMap;
  /** Max buffered events before a listener connects */
  maxBufferSize?: number;
  /** Filter events */
  filter?: {
    sources?: string[];
    minDuration?: number;
  };
}

export interface DevToolsConnection {
  /** The event bus instance */
  bus: EventBus;
  /** Session ID for this connection */
  sessionId: string;
  /** Disconnect and restore original hooks */
  disconnect: () => void;
}

let activeConnection: DevToolsConnection | null = null;

/**
 * Connect Nexus to DevTools.
 *
 * This function:
 * 1. Creates an EventBus
 * 2. Wires core devtools hooks to emit events on the bus
 * 3. Optionally connects to a DevTools server via Socket.IO
 *
 * Call this in development only:
 * ```ts
 * if (process.env.NODE_ENV === 'development') {
 *   connectDevTools({ port: 4380 });
 * }
 * ```
 */
export function connectDevTools(options: ConnectDevToolsOptions = {}): DevToolsConnection {
  // Prevent double connection
  if (activeConnection) {
    return activeConnection;
  }

  const {
    port = 4380,
    host = "localhost",
    framework = "unknown",
    nexusVersion = "0.0.0",
    sources,
    maxBufferSize,
    filter,
  } = options;

  const bus = new EventBus({ maxBufferSize });
  const sessionId = `session_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  // Helper to create events with envelope
  const createEvent = <T extends AnyDevToolsEvent>(partial: Omit<T, "sessionId">): T =>
    ({ ...partial, sessionId }) as T;

  // Check if event should be filtered
  const shouldFilter = (source: string): boolean => {
    if (filter?.sources && !filter.sources.includes(source)) return true;
    return false;
  };

  // ── Wire core hooks to EventBus ────────────────────────────────────────────

  devtoolsHooks.onRequestStart = (e) => {
    if (shouldFilter(e.source)) return;
    bus.emit(
      createEvent<RequestStartEvent>({
        id: e.id,
        type: "request:start",
        timestamp: e.timestamp,
        source: e.source,
        group: e.group,
        method: e.method,
        variables: e.variables,
        mode: e.mode,
        middlewareCount: e.middlewareCount,
        hasValidation: e.hasValidation,
      }),
    );
  };

  devtoolsHooks.onRequestEnd = (e) => {
    bus.emit(
      createEvent<RequestEndEvent>({
        id: e.id,
        type: "request:end",
        timestamp: e.timestamp,
        requestId: e.id,
        status: e.status,
        data: e.data,
        headers: e.headers,
        timing: e.timing,
      }),
    );
  };

  devtoolsHooks.onRequestError = (e) => {
    bus.emit(
      createEvent<RequestErrorEvent>({
        id: e.id,
        type: "request:error",
        timestamp: e.timestamp,
        requestId: e.id,
        error: e.error,
      }),
    );
  };

  devtoolsHooks.onMiddlewareEnter = (e) => {
    bus.emit(
      createEvent<MiddlewareEnterEvent>({
        id: e.requestId,
        type: "middleware:enter",
        timestamp: e.timestamp,
        requestId: e.requestId,
        name: e.name,
        index: e.index,
        totalCount: e.totalCount,
      }),
    );
  };

  devtoolsHooks.onMiddlewareExit = (e) => {
    bus.emit(
      createEvent<MiddlewareExitEvent>({
        id: e.requestId,
        type: "middleware:exit",
        timestamp: e.timestamp,
        requestId: e.requestId,
        name: e.name,
        index: e.index,
        duration: e.duration,
      }),
    );
  };

  devtoolsHooks.onMiddlewareError = (e) => {
    bus.emit(
      createEvent<MiddlewareErrorEvent>({
        id: e.requestId,
        type: "middleware:error",
        timestamp: e.timestamp,
        requestId: e.requestId,
        name: e.name,
        index: e.index,
        error: e.error,
      }),
    );
  };

  devtoolsHooks.onValidationStart = (e) => {
    bus.emit(
      createEvent<ValidationStartEvent>({
        id: e.requestId,
        type: "validation:start",
        timestamp: e.timestamp,
        requestId: e.requestId,
        target: e.target,
      }),
    );
  };

  devtoolsHooks.onValidationPass = (e) => {
    bus.emit(
      createEvent<ValidationPassEvent>({
        id: e.requestId,
        type: "validation:pass",
        timestamp: e.timestamp,
        requestId: e.requestId,
        target: e.target,
        duration: e.duration,
      }),
    );
  };

  devtoolsHooks.onValidationFail = (e) => {
    bus.emit(
      createEvent<ValidationFailEvent>({
        id: e.requestId,
        type: "validation:fail",
        timestamp: e.timestamp,
        requestId: e.requestId,
        target: e.target,
        issues: e.issues,
        duration: e.duration,
      }),
    );
  };

  devtoolsHooks.onHttpFetchStart = (e) => {
    bus.emit(
      createEvent<HttpFetchStartEvent>({
        id: e.requestId,
        type: "http:fetch:start",
        timestamp: e.timestamp,
        requestId: e.requestId,
        url: e.url,
        method: e.method,
      }),
    );
  };

  devtoolsHooks.onHttpFetchEnd = (e) => {
    bus.emit(
      createEvent<HttpFetchEndEvent>({
        id: e.requestId,
        type: "http:fetch:end",
        timestamp: e.timestamp,
        requestId: e.requestId,
        status: e.status,
        duration: e.duration,
      }),
    );
  };

  devtoolsHooks.onProxyReceive = (e) => {
    if (shouldFilter(e.source)) return;
    bus.emit(
      createEvent<ProxyReceiveEvent>({
        id: `proxy_${Date.now().toString(36)}`,
        type: "proxy:receive",
        timestamp: e.timestamp,
        proxyMethod: e.proxyMethod,
        source: e.source,
        group: e.group,
        method: e.method,
      }),
    );
  };

  devtoolsHooks.onProxyRespond = (e) => {
    if (shouldFilter(e.source)) return;
    bus.emit(
      createEvent<ProxyRespondEvent>({
        id: `proxy_${Date.now().toString(36)}`,
        type: "proxy:respond",
        timestamp: e.timestamp,
        proxyMethod: e.proxyMethod,
        source: e.source,
        group: e.group,
        method: e.method,
        status: e.status,
      }),
    );
  };

  // ── Socket.IO connection (optional) ────────────────────────────────────────

  let socketCleanup: (() => void) | undefined;

  // Dynamic import — socket.io-client is an optional peer dependency
  void tryConnectSocket(bus, sessionId, host, port, framework, nexusVersion, sources).then(
    (cleanup) => {
      socketCleanup = cleanup;
    },
  );

  // ── Build connection object ────────────────────────────────────────────────

  const disconnect = () => {
    // Restore hooks to no-ops
    devtoolsHooks.onRequestStart = undefined;
    devtoolsHooks.onRequestEnd = undefined;
    devtoolsHooks.onRequestError = undefined;
    devtoolsHooks.onMiddlewareEnter = undefined;
    devtoolsHooks.onMiddlewareExit = undefined;
    devtoolsHooks.onMiddlewareError = undefined;
    devtoolsHooks.onValidationStart = undefined;
    devtoolsHooks.onValidationPass = undefined;
    devtoolsHooks.onValidationFail = undefined;
    devtoolsHooks.onHttpFetchStart = undefined;
    devtoolsHooks.onHttpFetchEnd = undefined;
    devtoolsHooks.onProxyReceive = undefined;
    devtoolsHooks.onProxyRespond = undefined;

    socketCleanup?.();
    bus.clear();
    activeConnection = null;
  };

  activeConnection = { bus, sessionId, disconnect };
  return activeConnection;
}

/** Try to connect via Socket.IO (fails silently if not installed) */
async function tryConnectSocket(
  bus: EventBus,
  sessionId: string,
  host: string,
  port: number,
  framework: string,
  nexusVersion: string,
  sources?: SourceMap,
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
        sources: sources ?? {},
      });
    });

    // Forward all bus events to Socket.IO
    const unsubscribe = bus.on((event) => {
      socket.emit("event", event);
    });

    return () => {
      unsubscribe();
      socket.disconnect();
    };
  } catch {
    // socket.io-client not installed — run in local-only mode
    return undefined;
  }
}

/** Get the active DevTools connection (if any) */
export function getDevToolsConnection(): DevToolsConnection | null {
  return activeConnection;
}
