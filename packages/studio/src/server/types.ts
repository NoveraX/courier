/**
 * Studio server types.
 */

export interface StudioServerOptions {
  /** Server port (default: 4380) */
  port?: number;
  /** Server host (default: "localhost") */
  host?: string;
  /** Project root directory — all file paths resolve relative to this (default: process.cwd()) */
  projectRoot?: string;
  /** Called when server is ready */
  onReady?: (url: string) => void;
  /**
   * Additional CORS origins permitted to connect to the Studio Socket.IO
   * server beyond the auto-generated `http://{host}:{port}` and Vite dev
   * server (`http://localhost:4382`). Use for cross-origin embeds or
   * remote development.
   */
  extraCorsOrigins?: readonly string[];
}

export interface StudioServer {
  /** Server URL */
  url: string;
  /** Connected app sessions */
  sessions: Map<string, SessionInfo>;
  /** Close the server */
  close: () => Promise<void>;
}

export interface SessionInfo {
  sessionId: string;
  framework: string;
  nexusVersion: string;
  connectedAt: number;
  /**
   * Monotonic generation counter for this sessionId. Incremented in
   * `app-namespace.ts` whenever a new `connection:init` arrives reusing a
   * sessionId we have already seen. Lets future consumers reject stale
   * buffered events from a previous generation.
   */
  sessionVersion: number;
}
