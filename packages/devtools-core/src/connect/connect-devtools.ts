import { devtoolsHooks } from "@noverax/nexus";
import { EventBus } from "../event-bus";
import { extractSourceMap } from "../source-map";
import { wireHooks } from "./hooks";
import { wireHttpHooks } from "./hooks-http";
import { tryConnectSocket } from "./socket";
import type { ConnectDevToolsOptions, DevToolsConnection } from "./types";

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
    sourceMap,
    maxBufferSize,
    filter,
  } = options;

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
    devtoolsHooks.onCacheHit = undefined;
    devtoolsHooks.onCacheMiss = undefined;
    devtoolsHooks.onCacheStore = undefined;
    devtoolsHooks.onCacheInvalidate = undefined;
    devtoolsHooks.onDedupAbort = undefined;
    devtoolsHooks.onDedupReuse = undefined;
    devtoolsHooks.onUploadProgress = undefined;
    devtoolsHooks.onUploadComplete = undefined;

    socketCleanup?.();
    bus.clear();
    activeConnection = null;
  };

  activeConnection = { bus, sessionId, disconnect };
  return activeConnection;
}

/** Get the active DevTools connection (if any) */
export function getDevToolsConnection(): DevToolsConnection | null {
  return activeConnection;
}
