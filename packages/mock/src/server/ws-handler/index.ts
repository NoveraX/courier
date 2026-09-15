import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

import { logger } from "@noverax/courier";
import type { WebSocketServer as WSServerType } from "ws";
import type { MockRegistry } from "../../registry";
import type { MockChannelFn, MockHistoryEntry } from "../../types";
import type { PrefixMapping } from "../prefix-routes";

import { activateConnection, type WSRequestHooks } from "./connection-handler";
import { WSConnectionRegistry } from "./connection-registry";
import { isOriginAllowed, resolveWSRoute } from "./route-resolver";

export type { WSRequestHooks } from "./connection-handler";
export { WSConnectionRegistry } from "./connection-registry";

/** Default maximum WebSocket payload — 1 MiB. Override per server via config. */
const DEFAULT_MAX_PAYLOAD = 1 * 1024 * 1024;

/** Configuration for the mock WS upgrade handler */
export interface WSHandlerConfig {
  /** Mock registry — channel handlers are looked up here */
  registry: MockRegistry;
  /** Prefix mappings — used to route URL paths to group/method */
  mappings: PrefixMapping[];
  /** Request history (shared with HTTP routes) */
  history: MockHistoryEntry[];
  /** Optional studio hooks */
  hooks?: WSRequestHooks;
  /** Get current scenario state */
  getScenarioState: () => string;
  /**
   * Origin allowlist for upgrade requests.
   * - `undefined` (default) → all origins permitted (mock dev mode)
   * - `string[]` → only listed origins are allowed; all others get HTTP 403
   */
  allowedOrigins?: readonly string[];
  /** Maximum payload size in bytes (default 1 MiB) */
  maxPayload?: number;
}

/**
 * Create a WS upgrade handler for the mock server.
 *
 * Attaches to a Node.js HTTP server's "upgrade" event and routes incoming
 * connections to mock channel handlers via path → registry lookup.
 *
 * Path pattern: `/{groupPrefix}/{methodName}` (matches `buildDirectWSUrl`).
 * Protocol: subset of Courier WS protocol — `subscribe` (auto-fired by client
 * on connect), `message` (client→server), `data` (server→client),
 * `unsubscribe`, `ping`/`pong`.
 *
 * Each connection routes to exactly one channel handler. Broadcasts use
 * an in-memory per-topic registry to fan out to other connections.
 *
 * Returns an async upgrade handler. The first call lazy-loads the `ws`
 * package so users who don't mock any WS endpoints don't pay the cost.
 */
export function createMockWSHandler(config: WSHandlerConfig) {
  const connections = new WSConnectionRegistry();
  const maxPayload = config.maxPayload ?? DEFAULT_MAX_PAYLOAD;

  // Lazy-load the `ws` package once on first upgrade — cached for the
  // lifetime of the handler. Avoids the per-connection import cost while
  // still keeping `ws` an optional peer dependency.
  let wsServerPromise: Promise<WSServerType | null> | null = null;
  const loadWSServer = (): Promise<WSServerType | null> => {
    if (wsServerPromise) return wsServerPromise;
    wsServerPromise = import("ws")
      .then(
        (mod) =>
          new mod.WebSocketServer({
            noServer: true,
            maxPayload,
          }),
      )
      .catch((err: unknown) => {
        logger.error(
          "MockWS",
          `Failed to load 'ws' package: ${err instanceof Error ? err.message : "unknown"}`,
        );
        return null;
      });
    return wsServerPromise;
  };

  return async function handleUpgrade(
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): Promise<void> {
    // Origin allowlist check — runs before route resolution so unauthorized
    // probes don't reveal which paths exist.
    if (!isOriginAllowed(req.headers.origin, config.allowedOrigins)) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    const url = req.url ?? "";
    const route = resolveWSRoute(url, config.mappings);
    if (!route) {
      reject(socket, 404);
      return;
    }

    const handler = config.registry.get(route.group, route.method, config.getScenarioState());
    if (!handler || handler.transport !== "ws" || !handler.channelFn) {
      reject(socket, 404);
      return;
    }

    const wss = await loadWSServer();
    if (!wss) {
      reject(socket, 500);
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      activateConnection({
        ws,
        route,
        channelFn: handler.channelFn as MockChannelFn,
        url,
        history: config.history,
        hooks: config.hooks,
        registry: connections,
        scenarioState: config.getScenarioState(),
      });
    });
  };
}

function reject(socket: Duplex, status: number): void {
  const text =
    status === 404 ? "Not Found" : status === 403 ? "Forbidden" : "Internal Server Error";
  socket.write(`HTTP/1.1 ${status} ${text}\r\n\r\n`);
  socket.destroy();
}
