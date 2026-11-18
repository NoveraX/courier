import { ConfigurationError } from "../../errors/configuration-error";
import type { PlatformFetch } from "../../http-client/source-transport";
import { ownFields } from "../../utils/own";
import { CLIENT_LIMITS } from "../client-limits";
import { platformSocketFactory } from "./platform-socket";
import { rungMemory } from "./rung-memory";
import { ladderFactory } from "./transport-ladder";
import type { WSConnectionConfig, WSSocketFactory } from "./ws-types";

/** How long a WebSocket may go unanswered before HTTP carries the connection, unless `after` says. */
const FALLBACK_AFTER_MS = 3000;

/**
 * What a connection opens its sockets with: the application's factory, or
 * the platform's `WebSocket` — the source's class — and, unless `fallback`
 * is `false`, the ladder that carries the connection over HTTP where no
 * WebSocket gets through. A factory of the application's own climbs no
 * ladder unless `fallback` asks, and a platform whose `fetch` cannot read
 * an answer as it comes climbs none.
 *
 * @param config - The connection's options
 * @returns The factory
 * @throws {ConfigurationError} `INVALID_FALLBACK` for an `after` that is no
 *   whole number of ms from 1, or not under the 15 s a socket has to open
 * @example
 * ```ts
 * const factory = socketFactoryOf({ url: "wss://api.example.com/ws", fallback: { after: 2000 } });
 * ```
 */
export function socketFactoryOf(config: WSConnectionConfig): WSSocketFactory {
  const webSocket =
    config.socketFactory ?? platformSocketFactory(config.webSocket, config.socketInit);
  const given = config.fallback;
  if (given === false || (given === undefined && config.socketFactory !== undefined)) {
    return webSocket;
  }
  const { after = FALLBACK_AFTER_MS, remember = true } = ownFields(given ?? {});
  if (!Number.isInteger(after) || after < 1 || after >= CLIENT_LIMITS.WS_CONNECT_TIMEOUT_MS) {
    throw new ConfigurationError(
      "INVALID_FALLBACK",
      `[courier] fallback.after is ${after}: a whole number of ms from 1, under the ${CLIENT_LIMITS.WS_CONNECT_TIMEOUT_MS} ms a socket has to open.`,
    );
  }
  if (!answersStream(config.fetch)) return webSocket;
  return ladderFactory({
    webSocket,
    afterMs: after,
    memory: rungMemory(remember !== false),
    fetch: config.fetch,
    init: config.fetchInit,
    load: async () => (await import("../ws-http/http-socket")).createHTTPSocket,
  });
}

/* A `fetch` whose answers a socket over HTTP reads as they come, through a pipe. */
function answersStream(given: PlatformFetch | undefined): boolean {
  const fetches = given !== undefined || typeof globalThis.fetch === "function";
  return fetches && typeof ReadableStream === "function" && typeof TransformStream === "function";
}
