/**
 * DevTools server types.
 */

export interface DevToolsServerOptions {
  /** Server port (default: 4380) */
  port?: number;
  /** Server host (default: "localhost") */
  host?: string;
  /** Project root directory — all file paths resolve relative to this (default: process.cwd()) */
  projectRoot?: string;
  /** Called when server is ready */
  onReady?: (url: string) => void;
}

export interface DevToolsServer {
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
}
