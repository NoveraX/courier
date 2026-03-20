import type { EventBus } from "../event-bus";
import type { SourceMap } from "../events";
import { extractSourceMap } from "../source-map";
import { getSources, onSourcesChange, renameSourceKeys } from "../sources-registry";
import { handlePlaygroundExecute } from "./playground-executor";
import { extractProcessEnv } from "./socket-utils";

/** Try to connect via Socket.IO (fails silently if not installed) */
export async function tryConnectSocket(
  bus: EventBus,
  sessionId: string,
  host: string,
  port: number,
  framework: string,
  nexusVersion: string,
  sourceMap?: SourceMap,
): Promise<(() => void) | undefined> {
  try {
    const { io } = await import("socket.io-client");
    const url = `http://${host}:${port}`;
    const socket = io(`${url}/app`, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    socket.on("connect", () => {
      socket.emit("event", {
        id: sessionId,
        type: "connection:init",
        timestamp: Date.now(),
        sessionId,
        framework,
        nexusVersion,
        sources: sourceMap ?? {},
        env: extractProcessEnv(),
      });
    });

    const heartbeatInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit("event", {
          id: sessionId,
          type: "connection:heartbeat",
          timestamp: Date.now(),
          sessionId,
        });
      }
    }, 30_000);

    const unsubBus = bus.on((event) => {
      socket.emit("event", event);
    });

    const unsubSources = onSourcesChange((newSources) => {
      if (!socket.connected) return;
      socket.emit("event", {
        id: sessionId,
        type: "connection:sources",
        timestamp: Date.now(),
        sessionId,
        sources: extractSourceMap(newSources),
        env: extractProcessEnv(),
      });
    });

    // Playground: execute endpoint, capture result from bus events
    socket.on(
      "playground:execute",
      (
        payload: {
          source: string;
          group: string;
          method: string;
          variables: unknown;
          headers: Record<string, string>;
          mode: "direct" | "proxy";
        },
        callback: (result: Record<string, unknown>) => void,
      ) => {
        handlePlaygroundExecute(bus, getSources(), payload, callback);
      },
    );

    socket.on("catalog:names", (mapping: Record<string, string>) => {
      renameSourceKeys(mapping);
    });

    return () => {
      clearInterval(heartbeatInterval);
      unsubBus();
      unsubSources();
      socket.disconnect();
    };
  } catch {
    return undefined;
  }
}
