import { devtoolsHooks } from "@noverax/nexus";
import type { AnySource } from "@noverax/nexus/define";
import { EventBus } from "../event-bus";
import { getSources, registerSources } from "../sources-registry";
import { wireHooks } from "./hooks";
import { wireHttpHooks } from "./hooks-http";
import { tryConnectSocket } from "./socket";
import {
  createSourceNameResolver,
  findMatchingSourceKey,
  resolveNewSourceKey,
} from "./source-resolution";
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
 * Safe to call multiple times — subsequent calls return the existing
 * connection. Sources auto-register via defineApi() → onSourceDefined.
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

  if (existing) return existing;

  const {
    port = 4380,
    host = "localhost",
    framework = "unknown",
    nexusVersion = "0.0.0",
    sourceMap,
    maxBufferSize,
    filter,
  } = options;

  const bus = new EventBus({ maxBufferSize });
  const sessionId = `session_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const resolveSourceName = createSourceNameResolver(getSources);

  // Check if event should be filtered (uses resolved source name)
  const shouldFilter = (source: string): boolean => {
    if (filter?.sources && !filter.sources.includes(resolveSourceName(source))) return true;
    return false;
  };

  // Wire core hooks to EventBus
  wireHooks(bus, sessionId, resolveSourceName, shouldFilter);
  wireHttpHooks(bus, sessionId, resolveSourceName, shouldFilter);

  // Auto-register sources from defineApi() calls.
  // On HMR: replaces existing entry matched by baseURL + group overlap.
  // On first call: uses stored name from defineApi() or generates a key.
  devtoolsHooks.onSourceDefined = (newSource: unknown, baseURL: string) => {
    const current = getSources() ?? {};
    const src = newSource as AnySource;

    if (baseURL) {
      const key = findMatchingSourceKey(current, src, baseURL);
      if (key) {
        current[key] = src;
        registerSources({ ...current });
        return;
      }
    }

    current[resolveNewSourceKey(current, src)] = src;
    registerSources({ ...current });
  };

  // Socket.IO connection (optional)
  let socketCleanup: (() => void) | undefined;

  // Fire-and-forget — connectDevTools is synchronous so consumers don't need to await.
  void tryConnectSocket(bus, sessionId, host, port, framework, nexusVersion, sourceMap).then(
    (cleanup) => {
      socketCleanup = cleanup;
    },
  );

  // Build connection object
  const connection: DevToolsConnection = {
    bus,
    sessionId,
    disconnect: () => disconnectAll(socketCleanup, bus, setActiveConnection),
  };
  setActiveConnection(connection);
  return connection;
}

/** Get the active DevTools connection (if any) */
export function getDevToolsConnection(): DevToolsConnection | null {
  return getActiveConnection();
}

/** All hook names that connectDevTools wires — cleared on disconnect */
const ALL_HOOK_NAMES = [
  "onRequestStart",
  "onRequestEnd",
  "onRequestError",
  "onRequestAbort",
  "onMiddlewareEnter",
  "onMiddlewareExit",
  "onMiddlewareError",
  "onValidationStart",
  "onValidationPass",
  "onValidationFail",
  "onHttpFetchStart",
  "onHttpFetchEnd",
  "onHttpFetchError",
  "onProxyReceive",
  "onProxyRespond",
  "onProxyParse",
  "onProxyOriginReject",
  "onCacheHit",
  "onCacheMiss",
  "onCacheStore",
  "onCacheInvalidate",
  "onDedupAbort",
  "onDedupReuse",
  "onUploadProgress",
  "onUploadComplete",
  "onProxyClientTiming",
  "onSourceDefined",
] as const;

/** Restore all hooks to no-ops and tear down connection */
function disconnectAll(
  socketCleanup: (() => void) | undefined,
  bus: EventBus,
  clearConnection: (conn: null) => void,
): void {
  for (const name of ALL_HOOK_NAMES) {
    (devtoolsHooks as Record<string, unknown>)[name] = undefined;
  }
  socketCleanup?.();
  bus.clear();
  clearConnection(null);
}
