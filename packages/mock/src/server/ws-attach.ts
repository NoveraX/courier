/**
 * WebSocket upgrade plumbing for the mock HTTP server.
 *
 * The `ws` package and `createMockWSHandler` are loaded lazily so users
 * that only mock HTTP/SSE never pay for the WS dependency.
 *
 * `createWSUpgrade` returns `undefined` when no prefix mappings are
 * configured (i.e. there are no routable WS endpoints). `attachWSUpgrade`
 * wires the resulting handler onto the Node `http.Server.upgrade` event.
 */

import type { Server } from "node:http";
import type { MockRegistry } from "../registry";
import type { MockHistoryEntry } from "../types";
import type { PrefixMapping } from "./prefix-routes";
import { createMockWSHandler, type MockWSHandler } from "./ws-handler";

/** Options accepted by `createWSUpgrade` — mirror the WS bits of `MockServerConfig` */
export interface WSUpgradeOptions {
  registry: MockRegistry;
  mappings: PrefixMapping[] | undefined;
  history: MockHistoryEntry[];
  getScenarioState: () => string;
  allowedOrigins?: readonly string[];
  maxPayload?: number;
}

/**
 * Build a WS upgrade handler if there are any prefix mappings — otherwise
 * return `undefined` so the bootstrap can skip importing the `ws` runtime.
 */
export function createWSUpgrade(options: WSUpgradeOptions): MockWSHandler | undefined {
  if (!options.mappings || options.mappings.length === 0) return undefined;
  return createMockWSHandler({
    registry: options.registry,
    mappings: options.mappings,
    history: options.history,
    getScenarioState: options.getScenarioState,
    allowedOrigins: options.allowedOrigins,
    maxPayload: options.maxPayload,
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
    void wsUpgrade.handleUpgrade(req, socket, head);
  });
}
