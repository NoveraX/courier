import type { HandlerConfig, WSHandlerConfig } from "@noverax/courier";

import type { CourierServerOptions } from "./types";

/**
 * Every option of a config, present — possibly as `undefined`. Building the
 * handlers' options as this type makes an option the core adds, and this
 * server does not pass on, a compile error rather than a setting that is
 * silently ignored.
 */
type Forwarded<TConfig> = { [TKey in keyof Required<TConfig>]: TConfig[TKey] };

/**
 * The options the server's HTTP handler takes, out of the server's own.
 *
 * @param config - The server's options
 * @returns The core HTTP handler's options
 *
 * @example
 * ```ts
 * const handler = createHandler(httpHandlerOptions(config));
 * ```
 */
export function httpHandlerOptions(config: CourierServerOptions): HandlerConfig {
  const options: Forwarded<HandlerConfig> = {
    sources: config.sources,
    allowedOrigins: config.allowedOrigins,
    sseHeaders: config.sseHeaders,
    sseMaxLifetimeMs: config.sseMaxLifetimeMs,
    maxBodyBytes: config.maxBodyBytes,
    maxUploadBytes: config.maxUploadBytes,
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
 * @returns The core WebSocket handler's options
 *
 * @example
 * ```ts
 * const wsHandler = createWSHandler(wsHandlerOptions(config));
 * ```
 */
export function wsHandlerOptions(config: CourierServerOptions): WSHandlerConfig {
  const options: Forwarded<WSHandlerConfig> = {
    sources: config.sources,
    allowedOrigins: config.allowedOrigins,
    pubsub: config.pubsub,
    heartbeatIntervalMs: config.heartbeatIntervalMs,
    heartbeatTimeoutMs: config.heartbeatTimeoutMs,
    maxBufferedAmount: config.maxBufferedAmount,
    maxSubscriptionsPerConnection: config.maxSubscriptionsPerConnection,
    maxMessageSize: config.maxMessageSize,
    middlewareTimeoutMs: config.middlewareTimeoutMs,
    maxMessagesPerSecond: config.maxMessagesPerSecond,
    maxConnectionsPerIP: config.maxConnectionsPerIP,
    clientIp: config.clientIp,
    authorize: config.authorize,
    onConnect: config.onConnect,
    onDisconnect: config.onDisconnect,
    onError: config.onError,
    onMessageDrop: config.onMessageDrop,
    maxConsecutiveDrops: config.maxConsecutiveDrops,
    onTokenRefresh: config.onTokenRefresh,
    authorizeMessage: config.authorizeMessage,
    authRequiredTimeoutMs: config.authRequiredTimeoutMs,
  };
  return options;
}
