import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

import { logger } from "@noverax/courier";
import type { WebSocketServer as WSServerType } from "ws";
import type { MockRegistry } from "../../registry";
import type { MockHistoryEntry } from "../../types";
import type { PrefixMapping } from "../prefix-route-types";
import { acceptProxySocket, PROXY_WS_PATH } from "../proxy-ws";
import type { RequestHooks } from "../route-types";
import { activateConnection } from "./connection-handler";
import { WSConnectionRegistry } from "./connection-registry";
import { isOriginAllowed, requestPath, resolveWSRoute } from "./route-resolver";

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
  /** Told of each channel subscription as it opens and ends — Studio's mock logs */
  hooks?: RequestHooks;
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

/** What `createMockWSHandler` hands the server: the upgrade route, and its shutdown */
export interface MockWSHandler {
  /** Accept an HTTP upgrade onto a mock channel, or refuse it */
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void>;
  /**
   * Close every open channel — each hears `onLeave` — and resolve once they
   * are closed. Stopping the server used to leave them open and still served,
   * holding the process open.
   */
  close(): Promise<void>;
}

const CLOSE_GRACE_MS = 1000;

/**
 * Create a WS upgrade handler for the mock server. Two routes upgrade:
 *
 * - `/api/ws`, where a Courier proxy serves its channels: one socket carries
 *   every subscription a proxy caller makes, each by its topic.
 * - A channel's declared path under its group, `/{groupPrefix}/{path}`, where
 *   a direct caller connects (matches `buildDirectWSUrl`): one channel a socket.
 *
 * Both speak the Courier WS protocol, and a channel's broadcasts reach every
 * subscriber to its topic on either. The first upgrade loads the `ws`
 * package, so a server that serves no channel never loads it.
 */
export function createMockWSHandler(config: WSHandlerConfig): MockWSHandler {
  const connections = new WSConnectionRegistry();
  const proxyConfig = {
    registry: config.registry,
    mappings: config.mappings,
    history: config.history,
    getScenarioState: config.getScenarioState,
    connections,
    hooks: config.hooks,
  };
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
        logger.error("MockWS", "Failed to load the 'ws' package", err);
        return null;
      });
    return wsServerPromise;
  };

  async function close(): Promise<void> {
    const wss = wsServerPromise ? await wsServerPromise : null;
    const open = wss ? [...wss.clients] : [];
    await Promise.all(open.map(closeGracefully));
    connections.clear();
  }

  async function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    // Origin allowlist check — runs before route resolution so unauthorized
    // probes don't reveal which paths exist.
    if (!isOriginAllowed(req.headers.origin, config.allowedOrigins)) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    const url = req.url ?? "";
    if (requestPath(url) === PROXY_WS_PATH) {
      await upgradeProxy(req, socket, head);
      return;
    }
    const route = resolveWSRoute(url, config.mappings);
    if (!route) {
      reject(socket, 404);
      return;
    }

    const handler = config.registry.get(route.group, route.method, config.getScenarioState());
    const channelFn = handler?.transport === "ws" ? handler.channelFn : undefined;
    if (!channelFn) {
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
        channelFn,
        url,
        history: config.history,
        hooks: config.hooks,
        registry: connections,
        scenarioState: config.getScenarioState(),
      });
    });
  }

  async function upgradeProxy(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const wss = await loadWSServer();
    if (!wss) return reject(socket, 500);
    acceptProxySocket(wss, { req, socket, head }, proxyConfig);
  }

  return { handleUpgrade, close };
}

/** Close a socket with 1001, and cut it if the client does not answer in time. */
function closeGracefully(
  ws: WSServerType["clients"] extends Set<infer T> ? T : never,
): Promise<void> {
  return new Promise((resolve) => {
    ws.once("close", () => resolve());
    const cut = setTimeout(() => ws.terminate(), CLOSE_GRACE_MS);
    cut.unref();
    ws.close(1001, "Mock server stopping");
  });
}

function reject(socket: Duplex, status: number): void {
  const text =
    status === 404 ? "Not Found" : status === 403 ? "Forbidden" : "Internal Server Error";
  socket.write(`HTTP/1.1 ${status} ${text}\r\n\r\n`);
  socket.destroy();
}
