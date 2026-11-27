/**
 * A Courier server for a test whose own process runs as an app on another
 * platform does — React Native's globals in place of Node's — so that the
 * server keeps Node's. It serves `api.live.room`, which echoes what it is
 * sent, on every path: its sockets and its HTTP transport; it keeps a
 * minute of the room's events, for a connection that comes back. It tells
 * its parent where it listens, what each connection opened with and how
 * each ended, and takes from it what to broadcast to the room. With
 * `--refuse-upgrades` it answers every upgrade 403, as a proxy that lets no
 * WebSocket through, and serves its HTTP transport alone; with
 * `--heartbeat=<ms>` it pings each connection that often, and waits as long
 * for its pong; with `--allowed-origins=<a,b>` it admits the pages of those
 * origins besides its own.
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";

import { createWSHandler } from "../../src/adapter/handle-ws";
import { defineApi } from "../../src/define/api";
import { courier } from "../../src/define/courier";
import { defineGroup } from "../../src/define/group";
import { attachWebSocketUpgrade, type UpgradeServer } from "../../src/node";
import { takeTransportRequests } from "../../src/node-transport-requests";
import { registerSources } from "../../src/server/sources";

/** What the parent asks the server for. */
export type AppServerRequest =
  | { readonly op: "broadcast"; readonly payload: string }
  | { readonly op: "stats" }
  | { readonly op: "stop" };

/** A request, and the `id` its answer is sent back with. */
export type AppServerCommand = AppServerRequest & { readonly id: number };

/** What the server tells its parent unasked. */
export type AppServerEvent =
  | { readonly event: "listening"; readonly url: string }
  | { readonly event: "opened"; readonly headers: Record<string, string> }
  | { readonly event: "ended"; readonly code: number };

export const TOPIC = "api.live.room";

const { channel } = courier();
const api = defineApi({
  expose: true,
  name: "api",
  baseURL: "http://127.0.0.1:1",
  groups: {
    live: defineGroup({
      prefix: "live",
      endpoints: {
        room: channel
          .send<string>()
          .response<string>()
          .implement(() => ({ onMessage: (ctx, message) => ctx.send(`echo ${message}`) })),
      },
    }),
  },
});

function tell(message: AppServerEvent | { readonly id: number; readonly answer?: unknown }): void {
  process.send?.(message);
}

/* The value of `--name=value`, if the parent gave it. */
function given(name: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
}

const heartbeatMs = Number(given("heartbeat") ?? 600_000);
const allowedOrigins = given("allowed-origins")?.split(",");

registerSources({ api } as never);
const handler = createWSHandler({
  history: {},
  heartbeatIntervalMs: heartbeatMs,
  heartbeatTimeoutMs: heartbeatMs,
  ...(allowedOrigins && { allowedOrigins }),
  onConnect: ({ request }) => {
    tell({ event: "opened", headers: Object.fromEntries(request.headers) });
    return {};
  },
  onDisconnect: ({ code }) => tell({ event: "ended", code }),
});
const server = createServer();
if (process.argv.includes("--refuse-upgrades")) {
  server.on("upgrade", (_request, socket) => {
    socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
  });
  takeTransportRequests(server, { path: undefined, handler });
} else {
  attachWebSocketUpgrade(server, {
    path: undefined,
    createServer: (options) => new WebSocketServer(options) as unknown as UpgradeServer,
    onSocket: (socket, request) => handler.handleSocket(socket, request),
    httpTransport: handler,
  });
}

process.on("message", (command: AppServerCommand) => {
  void answer(command).then((reply) => tell({ id: command.id, answer: reply }));
});

async function answer(command: AppServerCommand): Promise<unknown> {
  switch (command.op) {
    case "broadcast":
      await handler.connections.broadcastToTopic(TOPIC, command.payload);
      return undefined;
    case "stats":
      return handler.stats();
    case "stop":
      await handler.destroy({ timeoutMs: 100 });
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      setImmediate(() => process.exit(0));
      return undefined;
  }
}

server.listen(0, "127.0.0.1", () => {
  const { port } = server.address() as AddressInfo;
  tell({ event: "listening", url: `ws://127.0.0.1:${port}` });
});
