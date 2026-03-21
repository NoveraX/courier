import type { MockServer } from "../server/create-mock-server";
import { createCommandHandler } from "./command-handler";
import { createEventEmitter } from "./event-emitter";
import type { BridgeContext, MockDevToolsBridge, MockDevToolsBridgeOptions } from "./types";

/**
 * Connect a mock server to DevTools via Socket.IO.
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
 * const bridge = await connectMockToDevTools(server, { port: 4380 });
 * ```
 */
export async function connectMockToDevTools(
  server: MockServer,
  options: MockDevToolsBridgeOptions = {},
): Promise<MockDevToolsBridge | undefined> {
  const { host = "localhost", port = 4380, name } = options;

  try {
    const { io } = await import("socket.io-client");
    const socket = io(`http://${host}:${port}/app`, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    const sessionId = `mock_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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
      routeCount: options.routeCount ?? 0,
      routes: options.routes ?? [],
      activeScenario: "happy-path",
      availableScenarios: options.scenarios ?? [],
    };

    const emitter = createEventEmitter(socket, ctx);
    const commandCleanup = createCommandHandler(socket, ctx);

    // Full snapshot on every (re)connect — UI rebuilds state from this
    socket.on("connect", () => {
      emitter.emitConnect();
    });

    return {
      serverId,
      disconnect() {
        commandCleanup();
        emitter.emitDisconnect();
        socket.disconnect();
      },
    };
  } catch {
    return undefined;
  }
}
