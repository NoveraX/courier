import type { Server } from "node:http";

import type { SSEConnectionRegistry, WSHandler } from "@noverax/courier";
import { createLogger } from "@noverax/courier";
import type { WebSocketServer } from "ws";

const log = createLogger("Server");

const WS_DRAIN_TIMEOUT_MS = 5_000;

/** What a Courier server stops. */
export interface ShutdownParts {
  /** The server to close */
  httpServer: Server;
  /** The WebSocket handler, which closes its connections and lets go of its subscriptions */
  ws: Pick<WSHandler, "destroy">;
  /** The `ws` server, once one exists: the sockets that did not close in time are ended there */
  getWss: () => WebSocketServer | undefined;
  /** The SSE side, to drain */
  getSSE: () =>
    | {
        sseConnections: SSEConnectionRegistry;
        shutdownSSE: (opts?: { retryMs?: number; drainMs?: number }) => Promise<void>;
      }
    | undefined;
  /** Settles once the server listens or fails to */
  ready: Promise<unknown>;
}

/**
 * Create a graceful shutdown handler for the Courier server: its streams
 * and its WebSocket connections are drained side by side — each told to
 * come back, and waited for within its deadline — and the HTTP server is
 * closed once they are. What does not close in time is ended, so the stop
 * settles within the deadlines whatever the clients, Redis and the network
 * do.
 *
 * @param parts - What it stops
 * @returns A function that stops the server
 */
export function createShutdown(parts: ShutdownParts): () => Promise<void> {
  const { httpServer, ready } = parts;
  let shuttingDown = false;

  const stop = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info("Shutting down...");

    await Promise.all([drainSSE(parts.getSSE()), drainWebSockets(parts)]);

    /* A server that never listened has nothing to close, and closing it
       rejected — under the default signal handlers that turned a SIGTERM
       after a failed start into a crash. One still starting is waited for,
       so a listener bound after stop() cannot be left open. The failure
       itself was reported where it happened. */
    const listened = await ready.then(
      () => true,
      () => false,
    );
    if (listened) {
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      });
    }

    log.info("Server stopped");
  };

  return stop;
}

/** Send shutdown event to all SSE connections, then abort */
async function drainSSE(
  sse:
    | { shutdownSSE: (opts?: { retryMs?: number; drainMs?: number }) => Promise<void> }
    | undefined,
): Promise<void> {
  if (!sse) return;
  await sse.shutdownSSE({ retryMs: 3000, drainMs: 2000 });
}

/* The handler closes its connections and waits for them within the
   deadline; a socket still open after it is ended without its handshake. */
async function drainWebSockets(parts: ShutdownParts): Promise<void> {
  await parts.ws.destroy({ timeoutMs: WS_DRAIN_TIMEOUT_MS });
  for (const ws of parts.getWss()?.clients ?? []) ws.terminate();
}
