/**
 * WebSocket upgrade plumbing for the mock HTTP server.
 *
 * The `ws` package and `createMockWSHandler` are loaded lazily so users
 * that only mock HTTP/SSE never pay for the WS dependency.
 *
 * `createWSUpgrade` builds the handler for every server: the proxy's route,
 * `/api/ws`, serves whatever channel is mocked, with or without a source.
 * `attachWSUpgrade` wires it onto the Node `http.Server.upgrade` event.
 */

import type { Server } from "node:http";

import { logger } from "@noverax/courier";
import type { HeartbeatConfig } from "@noverax/courier/internal";
import type { MockRegistry } from "../registry";
import type { MockHistoryEntry } from "../types";
import type { PrefixMapping } from "./prefix-route-types";
import type { RequestHooks } from "./route-types";
import { createMockWSHandler, type MockWSHandler } from "./ws-handler";

/** Options accepted by `createWSUpgrade` — mirror the WS bits of `MockServerConfig` */
export interface WSUpgradeOptions {
  registry: MockRegistry;
  mappings: PrefixMapping[] | undefined;
  history: MockHistoryEntry[];
  getScenarioState: () => string;
  allowedOrigins?: readonly string[] | undefined;
  maxPayload?: number | undefined;
  /** How often each socket is pinged, and how long its pong may take */
  heartbeat?: HeartbeatConfig | undefined;
  /** Told of each channel subscription as it opens and ends — Studio's mock logs */
  hooks?: RequestHooks | undefined;
}

/**
 * Build the server's WS upgrade handler. It loads the `ws` package on its
 * first upgrade, so a server no channel is asked of never loads it.
 *
 * @param options - What the channels are served from
 * @returns The handler
 * @example
 * ```ts
 * attachWSUpgrade(nodeServer, createWSUpgrade({ registry, mappings, history, getScenarioState }));
 * ```
 */
export function createWSUpgrade(options: WSUpgradeOptions): MockWSHandler {
  return createMockWSHandler({
    registry: options.registry,
    mappings: options.mappings ?? [],
    history: options.history,
    getScenarioState: options.getScenarioState,
    allowedOrigins: options.allowedOrigins,
    maxPayload: options.maxPayload,
    heartbeat: options.heartbeat,
    hooks: options.hooks,
  });
}

/**
 * Attach a WS upgrade handler to the Node HTTP server the mock listens on.
 *
 * @param nodeServer - The server
 * @param wsUpgrade - The handler every upgrade request goes to
 */
export function attachWSUpgrade(nodeServer: Server, wsUpgrade: MockWSHandler): void {
  nodeServer.on("upgrade", (req, socket, head) => {
    /* An upgrade that fails ends its own socket, never the mock's process. */
    wsUpgrade.handleUpgrade(req, socket, head).catch((error: unknown) => {
      logger.error("MockWS", "A WebSocket upgrade could not be handled", error);
      socket.destroy();
    });
  });
}
