/**
 * Studio server types.
 */

import type { CourierStudioConfig } from "@noverax/courier/config";

export interface StudioServerOptions {
  /**
   * First port handed to a managed mock that names none. Left out, it is
   * `studio.mockBasePort` in the project's courier.config, then 7001.
   */
  mockBasePort?: number;
  /** Server port. Left out, it is `studio.port` in courier.config, then 6280. */
  port?: number;
  /** Server host. Left out, it is `studio.host` in courier.config, then "localhost". */
  host?: string;
  /** Project root directory — all file paths resolve relative to this (default: process.cwd()) */
  projectRoot?: string;
  /**
   * Called once Studio listens, with the URL a browser opens. Given both
   * `port` and `host`, Studio listens at once and serves the project as
   * starting until its first load has an outcome; given less, it listens
   * once that load has an outcome, since the config may name the address.
   */
  onReady?: (url: string) => void;
  /**
   * Called once Studio listens and its first load of the project has an
   * outcome, with where it listens and the `studio` block it started with.
   */
  onStarted?: (started: StudioStarted) => void;
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

/** Where Studio listens, and what the project asked of it when it started. */
export interface StudioStarted {
  /** The URL a browser opens to reach Studio. */
  url: string;
  /** The host Studio is bound to. */
  host: string;
  /** The port Studio listens on. */
  port: number;
  /**
   * The `studio` block of the config Studio started with: empty when the
   * config has none, or its first load failed. Studio reads its address and
   * `mockBasePort` from it only when it starts.
   */
  studio: Readonly<CourierStudioConfig>;
}

export interface StudioServer {
  /**
   * The URL a browser opens to reach Studio. A wildcard host reads as
   * `localhost`. It is exact once `onReady` has fired: with `port: 0` it then
   * carries the real port, and an address the config names is known.
   */
  readonly url: string;
  /**
   * The project's token. A page opened at `url` reads everything Studio
   * shows; one opened at `${url}/#token=${token}` may also change the
   * project, its mocks and its saved sessions, and send from the Playground.
   */
  readonly token: string;
  /** Close the server */
  close: () => Promise<void>;
}
