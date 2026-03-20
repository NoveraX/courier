import type { MockServer } from "../server/create-mock-server";
import { createCommandHandler } from "./command-handler";
import { createEventEmitter } from "./event-emitter";
import type { BridgeContext, MockDevToolsBridge, MockDevToolsBridgeOptions } from "./types";

/**
 * Connect a mock server to DevTools via Socket.IO.
 *
 * Emits mock:* events to the DevTools server and listens for
 * commands (store mutations, scenario switches, network config).
 *
 * @example
 * ```ts
 * const server = createMockServer({ port: 3001 });
 * await server.start();
 * const bridge = await connectMockToDevTools(server, { port: 4380 });
 * // later: bridge.disconnect();
 * ```
 */
export async function connectMockToDevTools(
  server: MockServer,
  options: MockDevToolsBridgeOptions = {},
): Promise<MockDevToolsBridge | undefined> {
  const { host = "localhost", port = 4380, heartbeatInterval = 10_000, name } = options;

  try {
    const { io } = await import("socket.io-client");
    const url = `http://${host}:${port}`;
    const socket = io(`${url}/app`, {
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
      name: name ?? `Mock Server`,
      startedAt: Date.now(),
      requestCounter: 0,
    };

    const emitter = createEventEmitter(socket, ctx);
    const commandCleanup = createCommandHandler(socket, ctx);

    // Emit connect event on socket connection
    socket.on("connect", () => {
      emitter.emitConnect();
    });

    // Heartbeat
    const heartbeat = setInterval(() => {
      if (socket.connected) {
        emitter.emitStatus();
      }
    }, heartbeatInterval);

    return {
      serverId,
      disconnect() {
        clearInterval(heartbeat);
        commandCleanup();
        emitter.emitDisconnect();
        socket.disconnect();
      },
    };
  } catch {
    return undefined;
  }
}
