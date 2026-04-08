import { randomUUID } from "node:crypto";

import { logger } from "@noverax/nexus";

import type { MockServer } from "../server/create-mock-server";
import { createCommandHandler } from "./command-handler";
import { createEventEmitter } from "./event-emitter";

import type { BridgeContext, MockStudioBridge, MockStudioBridgeOptions } from "./types";

/**
 * Connect a mock server to Studio via Socket.IO.
 *
 * Sends a full snapshot on connect (and reconnect).
 * After that, events are pushed only when state changes
 * (request served, store mutated, scenario switched).
 * No polling or heartbeat — Socket.IO handles keepalive natively.
 *
 * @example
 * ```ts
 * const server = createMockServer({ port: 7001 });
 * await server.start();
 * const bridge = await connectMockToStudio(server, { port: 4380 });
 * ```
 */
export async function connectMockToStudio(
  server: MockServer,
  options: MockStudioBridgeOptions = {},
): Promise<MockStudioBridge | undefined> {
  const { host = "localhost", port = 4380, name } = options;

  try {
    const { io } = await import("socket.io-client");
    const socket = io(`http://${host}:${port}/app`, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    const sessionId = `mock_${randomUUID()}`;
    const serverId = name ?? `mock-server-${sessionId}`;

    const ctx: BridgeContext = {
      server,
      serverId,
      sessionId,
      name: name ?? "Mock Server",
      port: options.serverPort ?? 0,
      url: options.serverUrl ?? "",
      startedAt: Date.now(),
      requestCounter: 0,
      scenarioRequestCount: 0,
      routeCount: options.routeCount ?? 0,
      routes: options.routes ?? [],
      analyzedRoutes: options.analyzedRoutes ?? [],
      activeScenario: "happy-path",
      availableScenarios: options.scenarios ?? [],
      scenarioMap: options.scenarioMap ?? server.scenarios ?? {},
      reseed: options.reseed,
    };

    const emitter = createEventEmitter(socket, ctx);
    const commandCleanup = createCommandHandler(socket, ctx, emitter);

    // Wire emitter into route handler hooks
    const hooks = server.requestHooks;
    hooks.onStart = (id, httpMethod, path, group, endpoint, variables, requestHeaders) =>
      emitter.emitRequestStart(id, httpMethod, path, group, endpoint, variables, requestHeaders);
    hooks.onEnd = (id, status, data, duration, latencyInjected, scenarioState, responseHeaders) => {
      emitter.emitRequestEnd(
        id,
        status,
        data,
        duration,
        latencyInjected,
        scenarioState,
        responseHeaders,
      );
      checkAndAutoHalt(server, emitter);
    };
    hooks.onError = (id, status, message, duration) => {
      emitter.emitRequestError(id, status, message, duration);
      checkAndAutoHalt(server, emitter);
    };

    // Full snapshot on every (re)connect — UI rebuilds state from this
    socket.on("connect", () => {
      emitter.emitConnect();
    });

    return {
      serverId,
      disconnect() {
        commandCleanup();
        hooks.onStart = undefined;
        hooks.onEnd = undefined;
        hooks.onError = undefined;
        emitter.emitDisconnect();
        socket.disconnect();
      },
    };
  } catch (err) {
    logger.warn(
      "MockBridge",
      `Failed to connect to Studio at ${host}:${port}: ${err instanceof Error ? err.message : "unknown"}`,
    );
    return undefined;
  }
}

/** Check stop conditions after each request — auto-halt faults if threshold exceeded */
function checkAndAutoHalt(
  server: MockServer,
  emitter: ReturnType<typeof createEventEmitter>,
): void {
  const reason = server.networkState.checkStopConditions();
  if (!reason) return;

  // Auto-halt: reset network config and notify UI
  const prevConfig = server.networkState.getGlobalConfig();
  server.networkState.setConfig(undefined);
  server.networkState.resetMetrics();

  emitter.emitNetworkConfig({
    preset: "none",
    latency: 0,
    errorRate: 0,
    autoHalted: true,
    haltReason: reason,
    previousConfig: prevConfig,
  });
}
