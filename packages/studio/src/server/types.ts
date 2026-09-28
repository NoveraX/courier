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
   * Origins that may act as the Studio UI besides Studio's own page:
   * cross-origin embeds, remote development. The UI's own development
   * server needs no entry: it proxies to Studio under the host the page
   * called, which Studio takes as its page. Pages served from this machine
   * may connect as runtimes regardless.
   */
  extraCorsOrigins?: readonly string[];
}

export interface StudioServer {
  /**
   * The URL a browser opens to reach Studio. A wildcard host reads as
   * `localhost`; with `port: 0` it carries the real port once `onReady` has
   * fired.
   */
  readonly url: string;
  /** Close the server */
  close: () => Promise<void>;
}
