import { ConfigurationError, type HandlerConfig, type WSHandlerConfig } from "@noverax/courier";
import { readAllowedHosts, readAllowedOrigins } from "@noverax/courier/internal";
import { wsFrameLimit as frameLimitFor } from "@noverax/courier/node";
import type { CourierServerOptions } from "./types";

/**
 * Every option of a config, present — possibly as `undefined`. Building the
 * handlers' options as this type makes an option the core adds, and this
 * server does not pass on, a compile error rather than a setting that is
 * silently ignored.
 */
type Forwarded<TConfig> = { [TKey in keyof Required<TConfig>]: TConfig[TKey] };

/** The server's hosts and origins, as it read them when it started. */
export interface ServerSettings {
  /** As given: the handlers read them by the reading the start made, which is remembered. */
  readonly allowedHosts: CourierServerOptions["allowedHosts"];
  /** The list the handlers and the server's own CORS check against; none when nothing sets it. */
  readonly allowedOrigins: string[] | undefined;
}

/**
 * Read the server's hosts and origins as it starts: a function in its
 * options is called now, and `COURIER_ALLOWED_HOSTS` or
 * `COURIER_ALLOWED_ORIGINS` read where they name none. A server process is
 * started where it runs, never while an application is built, so nothing is
 * gained by waiting for the first request — and a mistake is better found
 * before the server listens than by its first caller.
 *
 * @param config - The server's options
 * @returns The hosts, and the origins as the list they come to
 * @throws ConfigurationError naming the setting, where it came from and what is wrong with it
 * @example
 * ```ts
 * const settings = readServerSettings(config);
 * const handler = createHandler(httpHandlerOptions(config, settings));
 * ```
 */
export function readServerSettings(config: CourierServerOptions): ServerSettings {
  const hosts = readAllowedHosts(config.allowedHosts);
  if (!hosts.ok) throw notStarted(hosts.error);
  const origins = readAllowedOrigins(config.allowedOrigins);
  if (!origins.ok) throw notStarted(origins.error);
  return {
    allowedHosts: config.allowedHosts,
    allowedOrigins: origins.value === undefined ? undefined : [...origins.value],
  };
}

function notStarted(error: ConfigurationError): ConfigurationError {
  return new ConfigurationError(error.code, `createCourierServer: ${error.message}`, {
    cause: error.cause,
  });
}

/**
 * The options the server's HTTP handler takes, out of the server's own.
 *
 * @param config - The server's options
 * @param settings - Its hosts and origins, as it read them when it started
 * @returns The core HTTP handler's options
 *
 * @example
 * ```ts
 * const handler = createHandler(httpHandlerOptions(config, readServerSettings(config)));
 * ```
 */
export function httpHandlerOptions(
  config: CourierServerOptions,
  settings: ServerSettings,
): HandlerConfig {
  const options: Forwarded<HandlerConfig> = {
    sources: config.sources,
    allowedOrigins: settings.allowedOrigins,
    allowedHosts: settings.allowedHosts,
    sseHeaders: config.sseHeaders,
    sseMaxLifetimeMs: config.sseMaxLifetimeMs,
    maxBodyBytes: config.maxBodyBytes,
    maxUploadBytes: config.maxUploadBytes,
    uploadMode: config.uploadMode,
    uploadMemoryBytes: config.uploadMemoryBytes,
    uploadDirectory: config.uploadDirectory,
    maxUploadParts: config.maxUploadParts,
    bodyIdleTimeoutMs: config.bodyIdleTimeoutMs,
    bodyTimeoutMs: config.bodyTimeoutMs,
    rateLimit: config.rateLimit,
    browsersOnly: config.browsersOnly,
    maxSSEConnections: config.maxSSEConnections,
    onSSEConnect: config.onSSEConnect,
    onSSEDisconnect: config.onSSEDisconnect,
    onSSEError: config.onSSEError,
  };
  return options;
}

/**
 * The options the server's WebSocket handler takes, out of the server's own.
 *
 * @param config - The server's options
 * @param settings - Its hosts and origins, as it read them when it started
 * @returns The core WebSocket handler's options
 *
 * @example
 * ```ts
 * const wsHandler = createWSHandler(wsHandlerOptions(config, readServerSettings(config)));
 * ```
 */
export function wsHandlerOptions(
  config: CourierServerOptions,
  settings: ServerSettings,
): WSHandlerConfig {
  const options: Forwarded<WSHandlerConfig> = {
    sources: config.sources,
    allowedOrigins: settings.allowedOrigins,
    allowedHosts: settings.allowedHosts,
    pubsub: config.pubsub,
    cluster: config.cluster,
    heartbeatIntervalMs: config.heartbeatIntervalMs,
    heartbeatTimeoutMs: config.heartbeatTimeoutMs,
    maxBufferedAmount: config.maxBufferedAmount,
    maxSubscriptionsPerConnection: config.maxSubscriptionsPerConnection,
    maxMessageSize: config.maxMessageSize,
    middlewareTimeoutMs: config.middlewareTimeoutMs,
    maxMessagesPerSecond: config.maxMessagesPerSecond,
    maxConnectionsPerIP: config.maxConnectionsPerIP,
    maxConnectionsPerKey: config.maxConnectionsPerKey,
    connectionLeases: config.connectionLeases,
    clientIp: config.clientIp,
    authorize: config.authorize,
    onConnect: config.onConnect,
    authTimeoutMs: config.authTimeoutMs,
    onDisconnect: config.onDisconnect,
    onError: config.onError,
    onMessageDrop: config.onMessageDrop,
    maxConsecutiveDrops: config.maxConsecutiveDrops,
    onReauth: config.onReauth,
    authorizeMessage: config.authorizeMessage,
    authRequiredTimeoutMs: config.authRequiredTimeoutMs,
  };
  return options;
}

/** The frame limit when neither `maxPayload` nor a larger `maxMessageSize` is set. */

/**
 * The largest WebSocket frame the server reads at all; `ws` closes the
 * connection with 1009 on a bigger one, before buffering it.
 *
 * Left out, the limit sits well above `maxMessageSize` — 1 MB, or twice
 * `maxMessageSize` when that is larger — so an oversized message reaches the
 * core, which refuses that one message with a `4413` error on a connection
 * that stays open, rather than closing the socket and each subscription on
 * it.
 *
 * @param config - The server's options
 * @returns The frame limit in bytes
 *
 * @example
 * ```ts
 * wsFrameLimit({ sources, maxMessageSize: 4_194_304 }); // 8_388_608
 * ```
 */
export function wsFrameLimit(config: CourierServerOptions): number {
  return config.maxPayload ?? frameLimitFor(config.maxMessageSize);
}
