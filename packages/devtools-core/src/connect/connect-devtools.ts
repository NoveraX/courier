import { devtoolsHooks } from "@noverax/nexus";
import type { AnySource } from "@noverax/nexus/define";
import { EventBus } from "../event-bus";
import { extractSourceMap } from "../source-map";
import { getSources, registerSources } from "../sources-registry";
import { wireHooks } from "./hooks";
import { wireHttpHooks } from "./hooks-http";
import { tryConnectSocket } from "./socket";
import type { ConnectDevToolsOptions, DevToolsConnection } from "./types";

/**
 * Store activeConnection on globalThis so it survives Turbopack / webpack
 * module duplication — same pattern as devtoolsHooks in core.
 */
const CONNECTION_KEY = Symbol.for("nexus.devtools.connection");
const g = globalThis as Record<symbol, unknown>;

function getActiveConnection(): DevToolsConnection | null {
  return (g[CONNECTION_KEY] as DevToolsConnection | undefined) ?? null;
}

function setActiveConnection(conn: DevToolsConnection | null): void {
  g[CONNECTION_KEY] = conn;
}

/**
 * Connect Nexus to DevTools.
 *
 * This function:
 * 1. Creates an EventBus
 * 2. Wires core devtools hooks to emit events on the bus
 * 3. Optionally connects to a DevTools server via Socket.IO
 *
 * Safe to call multiple times — subsequent calls with new `sources`
 * update the global registry and emit `connection:sources` without
 * tearing down the existing socket connection.
 *
 * Call this in development only:
 * ```ts
 * if (process.env.NODE_ENV === 'development') {
 *   connectDevTools({ port: 4380 });
 * }
 * ```
 */
export function connectDevTools(options: ConnectDevToolsOptions = {}): DevToolsConnection {
  const existing = getActiveConnection();

  // Re-entry: update sources in global registry (triggers connection:sources via listener)
  if (existing) {
    if (options.sources) {
      registerSources(options.sources);
    }
    return existing;
  }

  const {
    port = 4380,
    host = "localhost",
    framework = "unknown",
    nexusVersion = "0.0.0",
    sources,
    sourceMap,
    maxBufferSize,
    filter,
  } = options;

  // Populate global registry on first connection
  if (sources) {
    registerSources(sources);
  }

  const resolvedSourceMap = sourceMap ?? (sources ? extractSourceMap(sources) : undefined);

  const bus = new EventBus({ maxBufferSize });
  const sessionId = `session_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  // Resolve "_" (used by createCaller) to the real source name
  const sourceKeys = sources ? Object.keys(sources) : [];
  const resolveSourceName = (name: string): string => {
    if (name !== "_" || !sources || Object.hasOwn(sources, "_")) return name;
    return sourceKeys[0] ?? name;
  };

  // Check if event should be filtered (uses resolved source name)
  const shouldFilter = (source: string): boolean => {
    if (filter?.sources && !filter.sources.includes(resolveSourceName(source))) return true;
    return false;
  };

  // Wire core hooks to EventBus
  wireHooks(bus, sessionId, resolveSourceName, shouldFilter);
  wireHttpHooks(bus, sessionId, resolveSourceName, shouldFilter);

  // HMR reconciliation: when defineApi() re-creates a source with the same
  // baseURL, replace the old entry in the registry so Playground uses fresh code.
  devtoolsHooks.onSourceDefined = (newSource: unknown, baseURL: string) => {
    const current = getSources();
    if (!current || !baseURL) return;

    const src = newSource as AnySource;
    for (const [key, existing] of Object.entries(current)) {
      if (existing.options?.baseURL === baseURL && existing !== src) {
        current[key] = src;
        registerSources({ ...current });
        return;
      }
    }
  };

  // Socket.IO connection (optional)
  let socketCleanup: (() => void) | undefined;

  // Fire-and-forget — connectDevTools is synchronous so consumers don't need to await.
  // Socket connection happens asynchronously in the background.
  void tryConnectSocket(
    bus,
    sessionId,
    host,
    port,
    framework,
    nexusVersion,
    resolvedSourceMap,
    sources,
  ).then((cleanup) => {
    socketCleanup = cleanup;
  });

  // Build connection object
  const disconnect = (): void => {
    // Restore hooks to no-ops
    devtoolsHooks.onRequestStart = undefined;
    devtoolsHooks.onRequestEnd = undefined;
    devtoolsHooks.onRequestError = undefined;
    devtoolsHooks.onRequestAbort = undefined;
    devtoolsHooks.onMiddlewareEnter = undefined;
    devtoolsHooks.onMiddlewareExit = undefined;
    devtoolsHooks.onMiddlewareError = undefined;
    devtoolsHooks.onValidationStart = undefined;
    devtoolsHooks.onValidationPass = undefined;
    devtoolsHooks.onValidationFail = undefined;
    devtoolsHooks.onHttpFetchStart = undefined;
    devtoolsHooks.onHttpFetchEnd = undefined;
    devtoolsHooks.onHttpFetchError = undefined;
    devtoolsHooks.onProxyReceive = undefined;
    devtoolsHooks.onProxyRespond = undefined;
    devtoolsHooks.onProxyParse = undefined;
    devtoolsHooks.onProxyOriginReject = undefined;
    devtoolsHooks.onCacheHit = undefined;
    devtoolsHooks.onCacheMiss = undefined;
    devtoolsHooks.onCacheStore = undefined;
    devtoolsHooks.onCacheInvalidate = undefined;
    devtoolsHooks.onDedupAbort = undefined;
    devtoolsHooks.onDedupReuse = undefined;
    devtoolsHooks.onUploadProgress = undefined;
    devtoolsHooks.onUploadComplete = undefined;
    devtoolsHooks.onSourceDefined = undefined;

    socketCleanup?.();
    bus.clear();
    setActiveConnection(null);
  };

  const connection: DevToolsConnection = { bus, sessionId, disconnect };
  setActiveConnection(connection);
  return connection;
}

/** Get the active DevTools connection (if any) */
export function getDevToolsConnection(): DevToolsConnection | null {
  return getActiveConnection();
}
