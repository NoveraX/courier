/**
 * Studio server types.
 */

export interface StudioServerOptions {
  /** First port handed to a managed mock that named none (default 7001) */
  mockBasePort?: number;
  /** Server port (default: the shared Studio default, 6280) */
  port?: number;
  /** Server host (default: "localhost") */
  host?: string;
  /** Project root directory — all file paths resolve relative to this (default: process.cwd()) */
  projectRoot?: string;
  /** Called when server is ready */
  onReady?: (url: string) => void;
  /**
   * Called when the server cannot listen — the port is in use, or the host
   * cannot be bound. Without it the failure is logged. Either way the
   * returned handle's `close()` still releases what was started.
   */
  onError?: (error: Error) => void;
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
  /** Close the server */
  close: () => Promise<void>;
}
