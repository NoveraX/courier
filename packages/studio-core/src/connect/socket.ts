import type { EventBus } from "../event-bus";
import type { SourceMap } from "../events";
import { extractSourceMap } from "../source-map";
import { getSources, onSourcesChange, renameSourceKeys } from "../sources-registry";
import { getAppOrigin } from "./app-origin";
import { handlePlaygroundExecute } from "./playground-executor";
import {
  cancelAllPlaygroundStreams,
  cancelPlaygroundStream,
  handlePlaygroundStream,
} from "./playground-stream";
import { handlePlaygroundWSSend } from "./playground-ws-send";
import {
  sanitizePlaygroundExecutePayload,
  sanitizePlaygroundStreamPayload,
  sanitizePlaygroundWSSendPayload,
} from "./sanitize-playground-payload";
import { extractProcessEnv, sanitizeNameMapping } from "./socket-utils";

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
        sources: extractSourceMap(newSources, getAppOrigin()),
        env: extractProcessEnv(),
      });
    });

    // Playground: execute endpoint, capture result from bus events
    socket.on(
      "playground:execute",
      (rawPayload: unknown, callback: (result: Record<string, unknown>) => void) => {
        const payload = sanitizePlaygroundExecutePayload(rawPayload);
        if (!payload) {
          callback({ error: "Invalid playground:execute payload" });
          return;
        }
        handlePlaygroundExecute(bus, getSources(), payload, callback);
      },
    );

    // Playground: start SSE/WS stream (returns requestId, events flow via hooks)
    socket.on(
      "playground:stream",
      (rawPayload: unknown, callback: (result: { requestId: string; error?: string }) => void) => {
        const payload = sanitizePlaygroundStreamPayload(rawPayload);
        if (!payload) {
          callback({ requestId: "", error: "Invalid playground:stream payload" });
          return;
        }
        // Fire-and-forget: callback fires synchronously inside
        // handlePlaygroundStream; the executor runs in the background and
        // emits events via studio hooks. Any unexpected rejection (post-
        // callback) is caught here so socket.io's silent rejection
        // swallowing never hides a real bug.
        void handlePlaygroundStream(getSources(), payload, callback).catch((err) => {
          console.error("[nexus] playground:stream executor crashed:", err);
        });
      },
    );

    // Cancel any in-flight playground streams when the studio socket drops
    // — without this, abort controllers and channel registry entries leak
    // across reconnect cycles. Reconnect re-issues subscribe requests fresh.
    socket.on("disconnect", () => {
      cancelAllPlaygroundStreams();
    });

    // Playground: cancel an active stream.
    //
    // The cancel event arrives as a fire-and-forget broadcast from the
    // Studio server (because the server doesn't know which connected app
    // owns the requestId), so the optional callback may be undefined.
    // `cancelPlaygroundStream` returns false silently if this app didn't
    // own the stream — that's the no-op case for the broadcast pattern.
    socket.on(
      "playground:stream:cancel",
      (payload: { requestId: string }, callback?: (result: { ok: boolean }) => void) => {
        const ok = cancelPlaygroundStream(payload.requestId);
        callback?.({ ok });
      },
    );

    // Playground: send message to active WS channel.
    //
    // Like `playground:stream:cancel`, this arrives as a broadcast from the
    // Studio server: the server doesn't know which connected app process
    // owns the requestId (it can be the server `instrumentServer` OR a
    // browser `studio-core` bundle), so it fans the event out to every
    // app socket. `handlePlaygroundWSSend` returns a clean `ok:false` if
    // this process doesn't own the requestId — that's the no-op case for
    // non-owners. The Studio server then picks the first `ok:true` answer.
    socket.on(
      "playground:ws:send",
      (rawPayload: unknown, callback: (result: { ok: boolean; error?: string }) => void) => {
        const payload = sanitizePlaygroundWSSendPayload(rawPayload);
        if (!payload) {
          callback({ ok: false, error: "Invalid playground:ws:send payload" });
          return;
        }
        handlePlaygroundWSSend(payload, callback);
      },
    );

    socket.on("catalog:names", (rawMapping: unknown) => {
      const mapping = sanitizeNameMapping(rawMapping);
      if (mapping) renameSourceKeys(mapping);
    });

    return () => {
      clearInterval(heartbeatInterval);
      unsubBus();
      unsubSources();
      // Belt-and-braces: also cancel streams here in case the caller tears
      // down the connection without going through the socket "disconnect"
      // event (e.g. during process shutdown).
      cancelAllPlaygroundStreams();
      socket.disconnect();
    };
  } catch {
    return undefined;
  }
}
