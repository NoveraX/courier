import type { HandlerConfig, WSHandlerConfig } from "@noverax/courier";

import { wsFrameLimit as frameLimitFor } from "@noverax/courier/node";
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
    allowedHosts: config.allowedHosts,
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
    allowedHosts: config.allowedHosts,
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

/** The frame limit when neither `maxPayload` nor a larger `maxMessageSize` is set. */

/**
 * The largest WebSocket frame the server reads at all; `ws` closes the
 * connection with 1009 on a bigger one, before buffering it.
 *
 * It used to equal the message limit, so every message over 64 KB closed the
 * socket and ended each subscription on it — the core's refusal of a single
 * oversized message, a `4413` error on a connection that stays open, could
 * never be reached. Left out, the limit now sits well above `maxMessageSize`:
 * 1 MB, or twice `maxMessageSize` when that is larger.
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
