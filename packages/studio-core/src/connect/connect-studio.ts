import { createLogger, studioHooks } from "@noverax/nexus";
import type { AnySource } from "@noverax/nexus/define";
import { EventBus } from "../event-bus";
import { getSources, registerSources } from "../sources-registry";
import { detectAppOrigin, setAppOrigin } from "./app-origin";
import { disconnectAll } from "./connect-studio-disconnect";
import { generateSessionId, hasOptionDrift } from "./connect-studio-validation";
import { wireHooks } from "./hooks";
import { wireHttpHooks } from "./hooks-http";
import { tryConnectSocket } from "./socket";
import {
  createSourceNameResolver,
  findMatchingSourceKey,
  resolveNewSourceKey,
} from "./source-resolution";
import type { ConnectStudioOptions, StudioConnection } from "./types";

const log = createLogger("Studio");

/**
 * Store activeConnection on globalThis so it survives Turbopack / webpack
 * module duplication — same pattern as studioHooks in core.
 */
const CONNECTION_KEY = Symbol.for("nexus.studio.connection");
const g = globalThis as Record<symbol, unknown>;

function getActiveConnection(): StudioConnection | null {
  return (g[CONNECTION_KEY] as StudioConnection | undefined) ?? null;
}

function setActiveConnection(conn: StudioConnection | null): void {
  g[CONNECTION_KEY] = conn;
}

/**
 * Connect Nexus to Studio.
 *
 * This function:
 * 1. Creates an EventBus
 * 2. Wires core studio hooks to emit events on the bus
 * 3. Resolves and stores `appOrigin` (explicit option > `NEXUS_APP_URL` >
 *    `APP_URL`) so the Studio Playground proxy executor can build absolute
 *    URLs from relative `proxyPath` values
 * 4. Optionally connects to a Studio server via Socket.IO
 *
 * Safe to call multiple times — subsequent calls return the existing
 * connection. Sources auto-register via defineApi() → onSourceDefined.
 *
 * Call this in development only:
 * ```ts
 * if (process.env.NODE_ENV === 'development') {
 *   connectStudio({
 *     port: 4380,
 *     appOrigin: "http://localhost:3000", // required for Playground proxy SSE/WS
 *   });
 * }
 * ```
 *
 * The `appOrigin` field is required for Studio Playground proxy mode (SSE
 * and WS) when `proxyPath.{sse,ws}` is a relative path. Without it, the
 * first Subscribe click throws `ConfigurationError("APP_ORIGIN_NOT_CONFIGURED")`.
 * It can also be auto-detected from the `NEXUS_APP_URL` (preferred) or
 * `APP_URL` environment variables.
 *
 * @param options - Studio connection options
 * @returns Studio connection with `bus`, `sessionId`, and `disconnect()`
 */
export function connectStudio(options: ConnectStudioOptions = {}): StudioConnection {
  const existing = getActiveConnection();

  if (existing) {
    // Idempotent re-entry: a second connectStudio() call (typically from
    // HMR re-running a server entry) returns the existing connection. The
    // new options are silently ignored — if they differ from the originals,
    // warn so the developer doesn't spend time wondering why their updated
    // appOrigin / port / filter didn't take effect. Use disconnect() first
    // to actually rebind.
    if (existing.appliedOptions && hasOptionDrift(existing.appliedOptions, options)) {
      log.warn(
        "connectStudio() called again with different options — ignoring new options. Call disconnect() first to rebind.",
      );
    }
    return existing;
  }

  const {
    port = 4380,
    host = "localhost",
    framework = "unknown",
    nexusVersion = "0.0.0",
    sourceMap,
    maxBufferSize,
    filter,
    appOrigin,
  } = options;

  // Resolve appOrigin: explicit option > env var auto-detect > undefined.
  // The Studio Playground proxy executor reads this via getAppOriginParsed()
  // and throws APP_ORIGIN_NOT_CONFIGURED on the first SSE/WS Subscribe if
  // it ends up undefined — there is no `localhost:3000` magic default.
  //
  // Log the resolved value at info level for production debugging — the
  // missing-origin warning alone gives no signal when things work, leaving
  // "did Studio actually pick up my appOrigin?" as a manual question.
  const resolvedAppOrigin = appOrigin ?? detectAppOrigin();
  setAppOrigin(resolvedAppOrigin);
  if (resolvedAppOrigin) {
    log.info(`Bootstrapped — framework=${framework}, appOrigin=${resolvedAppOrigin}`);
  } else {
    log.warn(
      `Bootstrapped — framework=${framework}, appOrigin=<not set>. Playground proxy mode (SSE/WS) will throw APP_ORIGIN_NOT_CONFIGURED until you pass \`appOrigin\` or set NEXUS_APP_URL.`,
    );
  }

  const bus = new EventBus({ maxBufferSize });
  const sessionId = `session_${generateSessionId()}`;

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
  studioHooks.onSourceDefined = (newSource: unknown, baseURL: string) => {
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

  // Fire-and-forget — connectStudio is synchronous so consumers don't need
  // to await. The .catch is required because tryConnectSocket can reject
  // (network error, mid-handshake throw); without it the rejection becomes
  // an unhandledRejection on the user app process, which crashes Node 22+
  // by default.
  void tryConnectSocket(bus, sessionId, host, port, framework, nexusVersion, sourceMap)
    .then((cleanup) => {
      socketCleanup = cleanup;
    })
    .catch((err) => {
      log.warn("Studio socket connection failed", err);
    });

  // Build connection object
  const connection: StudioConnection = {
    bus,
    sessionId,
    disconnect: () => disconnectAll(socketCleanup, bus, () => setActiveConnection(null)),
    appliedOptions: options,
  };
  setActiveConnection(connection);
  return connection;
}

/** Get the active Studio connection (if any) */
export function getStudioConnection(): StudioConnection | null {
  return getActiveConnection();
}
