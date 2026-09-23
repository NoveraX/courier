import type { Hono } from "hono";

import { tryListen } from "./try-listen";
import { attachWSUpgrade, createWSUpgrade, type WSUpgradeOptions } from "./ws-attach";
import type { MockWSHandler } from "./ws-handler";

/** The part of Node's HTTP server that stopping needs */
interface ClosableServer {
  close(callback: () => void): void;
  closeAllConnections?(): void;
}

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
 * @returns `start` and `stop`
 */
export function createServerLifecycle(
  app: Hono,
  port: number,
  hostname: string,
  ws: WSUpgradeOptions,
): ServerLifecycle {
  let server: ClosableServer | undefined;
  let wsUpgrade: MockWSHandler | undefined;

  return {
    async start() {
      const { serve } = await import("@hono/node-server");

      // WS upgrade handler — only attached when prefix mappings exist (i.e.
      // the server has any routable WS endpoints). Avoids importing `ws`
      // when the user only mocks HTTP/SSE.
      wsUpgrade = createWSUpgrade(ws);

      return tryListen(serve, app, port, hostname, (nodeServer) => {
        server = nodeServer as unknown as ClosableServer;
        if (wsUpgrade) attachWSUpgrade(nodeServer, wsUpgrade);
      });
    },

    /* Closes the channels — each hears onLeave — and every connection, then
       resolves once the server is closed. It used to close only the listener
       and not wait: channels stayed open and served, and kept the process
       alive. */
    async stop() {
      const closing = server;
      server = undefined;
      await wsUpgrade?.close();
      if (!closing) return;
      await new Promise<void>((resolve) => {
        closing.close(() => resolve());
        closing.closeAllConnections?.();
      });
    },
  };
}
