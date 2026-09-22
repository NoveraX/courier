/**
 * Studio server types.
 */

export interface StudioServerOptions {
  /** Server port (default: the shared Studio default, 6280) */
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
  /** Close the server */
  close: () => Promise<void>;
}
