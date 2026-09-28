import { Server } from "node:http";
import type { ServerType } from "@hono/node-server";
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
 * @param strictPort - Fail when `port` is busy rather than take the next one
 * @returns `start` and `stop`
 */
export function createServerLifecycle(
  app: Hono,
  port: number,
  hostname: string,
  ws: WSUpgradeOptions,
  strictPort = false,
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
      return tryListen(serve, app, port, hostname, onServer, strictPort ? 0 : undefined);
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
