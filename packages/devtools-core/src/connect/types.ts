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
  /** Sources object — auto-extracts source map for API Explorer */
  sources?: Sources;
  /** Pre-built source map (alternative to sources) */
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
