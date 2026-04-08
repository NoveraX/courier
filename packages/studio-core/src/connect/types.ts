import type { Sources } from "@noverax/nexus/define";
import type { EventBus } from "../event-bus";
import type { SourceMap } from "../events";

export interface ConnectStudioOptions {
  /** Studio server port (default: 4380) */
  port?: number;
  /** Studio server host (default: "localhost") */
  host?: string;
  /** Framework identifier for connection:init */
  framework?: string;
  /** Nexus version for connection:init */
  nexusVersion?: string;
  /** Pre-built source map (sent in connection:init before registry populates) */
  sourceMap?: SourceMap;
  /** Max buffered events before a listener connects */
  maxBufferSize?: number;
  /** Filter events */
  filter?: {
    sources?: string[];
    minDuration?: number;
  };
  /**
   * The user-app's own HTTP origin (e.g. `"http://localhost:3000"` or
   * `"https://app.example.com"`). Required when Studio Playground proxy
   * mode is used with relative `proxyPath` values — Node `fetch` and
   * `WebSocket` need an absolute URL, and `globalThis.location` is
   * unavailable in server contexts.
   *
   * Auto-detected from `NEXUS_APP_URL` or `APP_URL` env vars when omitted.
   * If neither is set, Playground proxy mode throws
   * `ConfigurationError("APP_ORIGIN_NOT_CONFIGURED")` at the first SSE/WS
   * Subscribe — there is no `localhost:3000` magic default because the
   * correct value depends on your runtime (custom port, Docker, HTTPS,
   * reverse proxy, etc.).
   *
   * @example
   * ```ts
   * connectStudio({ appOrigin: "http://localhost:3000" });
   * ```
   */
  appOrigin?: string;
}

export interface StudioConnection {
  /** The event bus instance */
  bus: EventBus;
  /** Session ID for this connection */
  sessionId: string;
  /** Disconnect and restore original hooks */
  disconnect: () => void;
  /**
   * Snapshot of the options that were applied when this connection was
   * created. Used by `connectStudio()` to detect drift on idempotent
   * re-entry (typically HMR) and warn the developer that the new options
   * are being silently ignored.
   */
  appliedOptions?: ConnectStudioOptions;
}

export interface InstrumentServerOptions {
  /** API sources to instrument (required for server-side hook wiring) */
  sources: Sources;
  /** Studio server port (default: 4380) */
  port?: number;
  /** Studio server host (default: "localhost") */
  host?: string;
  /** Framework identifier (default: "server") */
  framework?: string;
  /** Event filtering */
  filter?: ConnectStudioOptions["filter"];
  /**
   * The user-app's own HTTP origin. See `ConnectStudioOptions.appOrigin`
   * for the full rationale and behavior. Required for Studio Playground
   * proxy mode with relative `proxyPath` values; auto-detected from
   * `NEXUS_APP_URL` / `APP_URL` env vars when omitted.
   */
  appOrigin?: string;
}
