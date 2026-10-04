import type { Server } from "node:http";
import type { CourierConfig, CourierStudioConfig } from "@noverax/courier/config";
import { formatStudioUrl, STUDIO_DEFAULT_HOST, STUDIO_DEFAULT_PORT } from "@noverax/courier/config";
import { holdProcessOpen } from "./hold-process-open";
import { listenStudio, type StudioAddress } from "./listen-studio";
import type { StudioStarted } from "./types";

/** Where mock-server port allocation starts when nothing says otherwise. */
const DEFAULT_MOCK_BASE_PORT = 7001;

/** What the caller pins, and whom Studio tells as it starts. */
export interface StudioStartupOptions {
  port?: number;
  host?: string;
  mockBasePort?: number;
  onReady?: (url: string) => void;
  onStarted?: (started: StudioStarted) => void;
  onError?: (error: Error) => void;
}

/** Studio's address and start, as far as they are known yet. */
export interface StudioStartup {
  /** The host Studio binds: pinned, else the config's once read, else the default. */
  host(): string;
  /** The port listened on, once listening. */
  port(): number | null;
  /** The URL a browser opens; exact once listening. */
  url(): string;
  /** Where ports assigned to mocks begin: pinned, else the config's once read, else 7001. */
  mockBasePort(): number;
  /** Listen now when host and port are pinned; otherwise once the config is read. */
  start(): void;
  /** Handed the config the first load read, or `null` when that load failed. */
  configRead(config: CourierConfig | null): void;
  /**
   * Never listen from now on, stop holding the process open, and wait for a
   * listen still under way to settle, so the server closed next is one that
   * listens rather than one about to.
   */
  close(): Promise<void>;
}

/**
 * Start Studio where the caller pins it, or where the project's config says.
 *
 * Studio's address can come from the `studio` block of courier.config, which
 * only the first load of the project evaluates — once, so a large generated
 * client is not evaluated twice at every start. Pinned to a host and a port,
 * Studio listens at once and that load runs while it serves the project as
 * starting; otherwise it listens once the load has an outcome, and holds the
 * process open until then, which the load's own time limit bounds. A first
 * load that fails leaves the pins and the defaults to decide.
 *
 * `onStarted` is told once Studio listens and the config is read, and only
 * after the first outcome is applied, so a problem that outcome recorded for
 * the banner is there to be shown.
 *
 * @param httpServer - Studio's HTTP server
 * @param options - The pins, and whom to tell
 * @returns The startup, read by the server as it serves
 * @example
 * ```ts
 * const startup = createStudioStartup(httpServer, { port: 6280, onStarted, onError });
 * createProjectState({ ...deps, onStartup: startup.configRead });
 * startup.start();
 * ```
 */
export function createStudioStartup(
  httpServer: Server,
  options: StudioStartupOptions,
): StudioStartup {
  const pinned = options.port !== undefined && options.host !== undefined;
  let studio: Readonly<CourierStudioConfig> | null = null;
  let address: StudioAddress | null = null;
  let begun = false;
  let closed = false;
  let release: () => void = () => undefined;

  const host = (): string => options.host ?? studio?.host ?? STUDIO_DEFAULT_HOST;
  const port = (): number => options.port ?? studio?.port ?? STUDIO_DEFAULT_PORT;

  function listen(): void {
    if (closed || address !== null || !begun || (!pinned && studio === null)) return;
    address = listenStudio(httpServer, {
      port: port(),
      host: host(),
      onReady: (url) => {
        if (closed) return;
        options.onReady?.(url);
        announce();
      },
      ...(options.onError === undefined ? {} : { onError: options.onError }),
    });
    release();
  }

  function announce(): void {
    if (closed || address === null || studio === null) return;
    const bound = address.port();
    if (bound === null) return;
    options.onStarted?.({ url: address.url(), host: host(), port: bound, studio });
  }

  return {
    host,
    port: () => address?.port() ?? null,
    url: () => address?.url() ?? formatStudioUrl(host(), port()),
    mockBasePort: () => options.mockBasePort ?? studio?.mockBasePort ?? DEFAULT_MOCK_BASE_PORT,
    start() {
      begun = true;
      if (!pinned && studio === null && !closed) release = holdProcessOpen();
      listen();
    },
    configRead(config) {
      if (studio !== null) return;
      studio = config?.studio ?? {};
      if (address === null) listen();
      else queueMicrotask(announce);
    },
    async close() {
      closed = true;
      release();
      await address?.settled();
    },
  };
}
