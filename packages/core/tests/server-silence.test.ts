/**
 * A server that stops answering without closing — a hung process, a dead
 * peer behind a proxy that keeps the TCP connection up. The client's
 * silence watchdog is its only way to notice.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";

import { createWSConnection } from "../src/realtime/ws/ws-connection";
import type { WSConnection } from "../src/realtime/ws/ws-types";

let server: Server | undefined;
let connection: WSConnection | undefined;
const raw: Socket[] = [];

afterEach(async () => {
  connection?.close();
  for (const socket of raw.splice(0)) socket.destroy();
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
  server = undefined;
  connection = undefined;
});

/**
 * A server that pings every socket every 20 ms, as a Courier server does
 * every 25 s. `hang()` makes the first socket go silent and stop reading —
 * the close handshake can then never complete.
 */
async function pingingServer(): Promise<{ url: string; sockets: () => number; hang(): void }> {
  const timers: ReturnType<typeof setInterval>[] = [];
  server = createServer();
  server.on("upgrade", (_request, socket) => raw.push(socket as Socket));
  const wss = new WebSocketServer({ server });
  wss.on("connection", (ws) => {
    const timer = setInterval(() => ws.send(JSON.stringify({ type: "ping" })), 20);
    timers.push(timer);
    ws.on("close", () => clearInterval(timer));
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `ws://127.0.0.1:${port}/`,
    sockets: () => raw.length,
    hang() {
      clearInterval(timers[0]);
      raw[0]?.pause();
    },
  };
}

function until(conn: WSConnection, status: string): Promise<void> {
  return new Promise((resolve) => {
    if (conn.status === status) return resolve();
    const stop = conn.onStatusChange((next) => {
      if (next !== status) return;
      stop();
      resolve();
    });
  });
}

describe("a connection to a server that stops answering", () => {
  it("is dropped once the silence window passes, and reconnects", async () => {
    const hub = await pingingServer();
    connection = createWSConnection({
      url: hub.url,
      heartbeat: { intervalMs: 100, timeoutMs: 100 },
      backoff: { initialMs: 10, jitter: false },
    });
    await until(connection, "connected");
    const statuses: string[] = [];
    connection.onStatusChange((status) => statuses.push(status));

    hub.hang();
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(statuses).toEqual(["reconnecting", "connecting", "connected"]);
    expect(hub.sockets()).toBe(2);
  });
});
