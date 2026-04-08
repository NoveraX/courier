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

import type { MockRegistry } from "../registry";
import type { MockHistoryEntry } from "../types";
import type { PrefixMapping } from "./prefix-routes";
import { createMockWSHandler } from "./ws-handler";

/** Options accepted by `createWSUpgrade` — mirror the WS bits of `MockServerConfig` */
export interface WSUpgradeOptions {
  registry: MockRegistry;
  mappings: PrefixMapping[] | undefined;
  history: MockHistoryEntry[];
  getScenarioState: () => string;
  allowedOrigins?: readonly string[];
  maxPayload?: number;
}

/** Handler signature returned by `createMockWSHandler` */
type WSUpgradeHandler = ReturnType<typeof createMockWSHandler>;

/**
 * Build a WS upgrade handler if there are any prefix mappings — otherwise
 * return `undefined` so the bootstrap can skip importing the `ws` runtime.
 */
export function createWSUpgrade(options: WSUpgradeOptions): WSUpgradeHandler | undefined {
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
 * Attach a WS upgrade handler to a Node HTTP server.
 *
 * Done via a generic `on("upgrade", ...)` listener — we cast to a minimal
 * interface to avoid pulling in `@types/node` HTTP types from the public API.
 */
export function attachWSUpgrade(
  nodeServer: { close: () => void },
  wsUpgrade: WSUpgradeHandler,
): void {
  (
    nodeServer as unknown as {
      on(event: string, listener: (...args: unknown[]) => void): void;
    }
  ).on("upgrade", (...args: unknown[]) => {
    const [req, socket, head] = args as [
      Parameters<WSUpgradeHandler>[0],
      Parameters<WSUpgradeHandler>[1],
      Parameters<WSUpgradeHandler>[2],
    ];
    void wsUpgrade(req, socket, head);
  });
}
