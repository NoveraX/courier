import type { Server } from "node:http";

import type { SSEConnectionRegistry } from "@noverax/courier";
import { createLogger } from "@noverax/courier";
import type { WebSocketServer } from "ws";

const log = createLogger("Server");

const WS_DRAIN_TIMEOUT_MS = 5_000;

/**
 * Create a graceful shutdown handler for the Courier server.
 *
 * @param httpServer - The server to close.
 * @param getWss - The WebSocket server, once one exists.
 * @param getSSE - The SSE side, to drain.
 * @param ready - Settles once the server listens or fails to.
 * @returns A function that stops the server.
 */
export function createShutdown(
  httpServer: Server,
  getWss: () => WebSocketServer | undefined,
  getSSE: () =>
    | {
        sseConnections: SSEConnectionRegistry;
        shutdownSSE: (opts?: { retryMs?: number; drainMs?: number }) => Promise<void>;
      }
    | undefined,
  ready: Promise<unknown>,
): () => Promise<void> {
  let shuttingDown = false;

  const stop = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info("Shutting down...");

    // Drain SSE and WS connections in parallel
    await Promise.all([drainSSE(getSSE()), drainWebSockets(getWss())]);

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

/** Attach SIGTERM/SIGINT handlers that trigger graceful shutdown */
export function setupSignalHandlers(shutdown: () => Promise<void>): void {
  let called = false;

  const handler = async (signal: string) => {
    if (called) process.exit(1);
    called = true;
    log.info(`Received ${signal}`);
    await shutdown();
    process.exit(0);
  };

  process.on("SIGTERM", () => handler("SIGTERM"));
  process.on("SIGINT", () => handler("SIGINT"));
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

/** Close all WS clients gracefully, then force-terminate after timeout */
async function drainWebSockets(wss: WebSocketServer | undefined): Promise<void> {
  if (!wss) return;

  for (const ws of wss.clients) {
    ws.close(1012, "Server shutting down");
  }

  await Promise.race([waitForEmpty(wss), sleep(WS_DRAIN_TIMEOUT_MS)]);

  for (const ws of wss.clients) {
    ws.terminate();
  }
}

function waitForEmpty(wss: WebSocketServer): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (wss.clients.size === 0) resolve();
      else setTimeout(check, 100);
    };
    check();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
