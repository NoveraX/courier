import { Server } from "node:http";
import type { ServerType } from "@hono/node-server";
import type { Hono } from "hono";

import { tryListen } from "./try-listen";
import { attachWSUpgrade, createWSUpgrade, type WSUpgradeOptions } from "./ws-attach";
import type { MockWSHandler } from "./ws-handler";

/** The part of Node's HTTP server that stopping needs */
interface ClosableServer {
  close(callback: () => void): void;
  closeIdleConnections?(): void;
  closeAllConnections?(): void;
}

/* How long a request being answered may take to finish once the server stops:
   a mock's latency can hold one, and a fault that waits for the client's
   timeout holds it longer than is worth waiting for. */
const STOP_GRACE_MS = 3_000;

const IDLE_SWEEP_MS = 25;

/** Starting and stopping a mock server's listener and its WebSocket channels */
export interface ServerLifecycle {
  start(): Promise<{ port: number; url: string }>;
  stop(): Promise<void>;
}

/**
 * The listen/close half of a mock server.
 *
 * @param app - The Hono app to serve
 * @param port - Preferred port; the next free one is taken if it is busy
 * @param hostname - Where to listen; `localhost` means loopback only
 * @param ws - What the WebSocket upgrade route needs
 * @param strictPort - Fail when `port` is busy rather than take the next one
 * @param avoidPorts - Ports the search for the next one passes over
 * @param stopStreams - Ends the server's open event streams when it stops
 * @returns `start` and `stop`
 */
export function createServerLifecycle(
  app: Hono,
  port: number,
  hostname: string,
  ws: WSUpgradeOptions,
  strictPort = false,
  stopStreams: () => void = () => undefined,
  avoidPorts: readonly number[] = [],
): ServerLifecycle {
  let server: ClosableServer | undefined;
  let wsUpgrade: MockWSHandler | undefined;

  return {
    async start() {
      const { serve } = await import("@hono/node-server");

      wsUpgrade = createWSUpgrade(ws);

      const onServer = (nodeServer: ServerType) => {
        server = nodeServer;
        /* The mock serves HTTP/1.1, where a WebSocket upgrades. */
        if (wsUpgrade && nodeServer instanceof Server) attachWSUpgrade(nodeServer, wsUpgrade);
      };
      const retries = strictPort ? 0 : undefined;
      return tryListen(serve, app, port, hostname, onServer, retries, new Set(avoidPorts));
    },

    /* Closes the channels — each hears onLeave — and ends the event streams,
       lets the requests being answered finish, up to a bound, and resolves
       once the server is closed. Closing every connection at once cut a
       request in the middle of its latency, which a restart made routine. */
    async stop() {
      const closing = server;
      server = undefined;
      await wsUpgrade?.close();
      stopStreams();
      if (!closing) return;
      await new Promise<void>((resolve) => {
        /* A connection whose answer has just ended is kept alive for its
           next request; it is closed as soon as it is idle. */
        const sweep = setInterval(() => closing.closeIdleConnections?.(), IDLE_SWEEP_MS);
        const cut = setTimeout(() => closing.closeAllConnections?.(), STOP_GRACE_MS);
        closing.close(() => {
          clearInterval(sweep);
          clearTimeout(cut);
          resolve();
        });
        closing.closeIdleConnections?.();
      });
    },
  };
}
