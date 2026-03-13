import { devtoolsHooks } from "@noverax/nexus";
import type { AnySource } from "@noverax/nexus/define";
import { EventBus } from "../event-bus";
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

  // Resolve "_" (used by createCaller) to the real source name — reads registry dynamically
  const resolveSourceName = (name: string): string => {
    if (name !== "_") return name;
    const current = getSources();
    if (!current || Object.hasOwn(current, "_")) return name;
    return Object.keys(current)[0] ?? name;
  };

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
  // On first call: adds new entry with a generated key.
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

    current[generateSourceKey(current)] = src;
    registerSources({ ...current });
  };

  // Socket.IO connection (optional)
  let socketCleanup: (() => void) | undefined;

  // Fire-and-forget — connectDevTools is synchronous so consumers don't need to await.
  // Socket connection happens asynchronously in the background.
  void tryConnectSocket(bus, sessionId, host, port, framework, nexusVersion, sourceMap).then(
    (cleanup) => {
      socketCleanup = cleanup;
    },
  );

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

/**
 * Find the registry key for the source that best matches the new one.
 *
 * Multiple sources can share a baseURL (e.g. jsonPlaceholder + brokenApi
 * both hit jsonplaceholder.typicode.com). Matching by baseURL alone would
 * let a later defineApi() overwrite the wrong entry. Instead we pick the
 * candidate with the highest group-name overlap, falling back to a plain
 * baseURL match only when there's a single candidate.
 */
function findMatchingSourceKey(
  current: Record<string, AnySource>,
  newSource: AnySource,
  baseURL: string,
): string | undefined {
  const newGroups = new Set(getGroupNames(newSource));

  let bestKey: string | undefined;
  let bestOverlap = -1;
  let candidateCount = 0;

  for (const [key, existing] of Object.entries(current)) {
    if (existing.options?.baseURL !== baseURL || existing === newSource) continue;
    candidateCount++;

    const overlap = getGroupNames(existing).filter((g) => newGroups.has(g)).length;
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestKey = key;
    }
  }

  // Only accept a zero-overlap match when there is exactly one candidate —
  // avoids replacing the wrong source when multiple share the same baseURL.
  if (bestOverlap === 0 && candidateCount > 1) return undefined;

  return bestKey;
}

/** Extract group names from a source's options (handles grouped + flat APIs). */
function getGroupNames(source: AnySource): string[] {
  const opts = source.options as { groups?: Record<string, unknown> } | undefined;
  return opts?.groups ? Object.keys(opts.groups) : [];
}

/** Generate a unique key for a new source in the registry. */
function generateSourceKey(existing: Record<string, unknown>): string {
  let idx = Object.keys(existing).length;
  while (Object.hasOwn(existing, `source_${idx}`)) idx++;
  return `source_${idx}`;
}
