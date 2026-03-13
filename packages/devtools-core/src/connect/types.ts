import type { Sources } from "@noverax/nexus/define";
import type { EventBus } from "../event-bus";
import type { SourceMap } from "../events";

export interface ConnectDevToolsOptions {
  /** DevTools server port (default: 4380) */
  port?: number;
  /** DevTools server host (default: "localhost") */
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
}

export interface DevToolsConnection {
  /** The event bus instance */
  bus: EventBus;
  /** Session ID for this connection */
  sessionId: string;
  /** Disconnect and restore original hooks */
  disconnect: () => void;
}

export interface InstrumentServerOptions {
  /** API sources to instrument (required for server-side hook wiring) */
  sources: Sources;
  /** DevTools server port (default: 4380) */
  port?: number;
  /** DevTools server host (default: "localhost") */
  host?: string;
  /** Framework identifier (default: "server") */
  framework?: string;
  /** Event filtering */
  filter?: ConnectDevToolsOptions["filter"];
}
