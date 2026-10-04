import type {
  ConnectionRegistry,
  ConnectResult,
  HandlerConfig,
  SSEConnectionRegistry,
  WSHandlerConfig,
} from "@noverax/courier";
import type { Sources } from "@noverax/courier/define";

/**
 * Options for `createCourierServer`: where it listens and what it serves,
 * plus every option of the core HTTP handler and of the core WebSocket
 * handler, which it passes on. Among them are the request body limits every
 * framework adapter takes — `maxBodyBytes` for a JSON envelope (1 MB by
 * default) and `maxUploadBytes` for a multipart upload (10 MB by default) —
 * and the WebSocket limits and authorization hooks: `maxConnectionsPerIP`,
 * `clientIp`, `maxSubscriptionsPerConnection`, `maxMessageSize`,
 * `maxMessagesPerSecond`, `authorize`, `authorizeMessage` and
 * `onTokenRefresh`.
 *
 * `TConnect` and `TStreamConnect` are what `onConnect` and `onSSEConnect`
 * return, which type the `meta` the other WebSocket and SSE hooks receive;
 * both are inferred from those hooks.
 */
export interface CourierServerOptions<
  TConnect extends ConnectResult = ConnectResult,
  TStreamConnect extends ConnectResult = ConnectResult,
> extends Omit<HandlerConfig<TStreamConnect>, "sources" | "allowedOrigins">,
    Omit<WSHandlerConfig<TConnect>, "sources" | "allowedOrigins"> {
  /**
   * The API sources this server answers for. They stay its own: another
   * server or a `registerSources` call in the same process does not change
   * them, and they are not written into the process-wide registry.
   */
  sources: Sources;
  /** Server port (default 3001) */
  port?: number | undefined;
  /**
   * Address to listen on (default "127.0.0.1", the IPv4 loopback, which a
   * client given `localhost` reaches too). `"::1"` listens on the IPv6
   * loopback; `"0.0.0.0"` or `"::"` accepts other machines, as a container
   * needs.
   */
  host?: string | undefined;
  /**
   * Origins of the browser apps that may call the server, for CORS and the
   * WebSocket origin check. Left out, the server answers its own origin only,
   * and loopback origins outside production.
   */
  allowedOrigins?: string[] | undefined;
  /**
   * Largest WebSocket frame read at all, in bytes; a bigger one closes the
   * connection with 1009 before it is buffered. Default 1 MB, or twice
   * `maxMessageSize` when that is larger, so a message over `maxMessageSize`
   * is refused with a `4413` error on a connection that stays open.
   */
  maxPayload?: number | undefined;
  /**
   * Drain on SIGTERM/SIGINT, then end the process (default true). When the
   * application handles the signal too, the server still drains but leaves
   * ending the process to the application's handler.
   */
  signals?: boolean | undefined;
  /** Callback fired when server starts listening */
  onReady?: ((url: string) => void) | undefined;
  /**
   * Called when the server itself fails — a port already in use, a socket
   * error after start. Without it such a failure is only logged; the process
   * is never ended on the host's behalf.
   */
  onServerError?: ((error: Error) => void) | undefined;
}

/** Handle returned by createCourierServer for lifecycle control */
export interface CourierServer {
  /** Base URL of the running server */
  url: string;
  /**
   * Resolves with the base URL once the server is listening, and rejects if
   * it never gets there. Await it to find out whether startup succeeded —
   * a failed listen is reported here rather than by ending the process.
   *
   * @example
   * ```ts
   * const server = createCourierServer({ sources, port: 3001 });
   * try {
   *   await server.ready;
   * } catch {
   *   // pick another port, or report it — the host is still running
   * }
   * ```
   */
  readonly ready: Promise<string>;
  /** Gracefully shut down the server */
  stop(): Promise<void>;
  /** Active SSE connection registry */
  readonly sseConnections: SSEConnectionRegistry;
  /** Active WS connection registry */
  readonly wsConnections: ConnectionRegistry;
}
