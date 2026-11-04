/**
 * A connection closed, or reconnected, while its socket is still opening
 * lets that socket go without a failure of its own: a socket of the `ws`
 * package reports the abort of its handshake as an error event, and one with
 * no listener for it throws it out of the process.
 */
import { type AddressInfo, createServer, type Server, type Socket } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";

import { createWSConnection } from "../src/realtime/ws/ws-connection";
import type { WSClientSocket, WSConnection } from "../src/realtime/ws/ws-types";

let server: Server | undefined;
const accepted: Socket[] = [];
const sockets: WebSocket[] = [];
let connection: WSConnection | undefined;

afterEach(async () => {
  connection?.close();
  for (const socket of accepted.splice(0)) socket.destroy();
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
  server = undefined;
  vi.restoreAllMocks();
});

/* A server that takes the TCP connection and never answers the upgrade: the socket stays opening. */
async function silentServer(): Promise<string> {
  server = createServer((socket) => accepted.push(socket));
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return `ws://127.0.0.1:${port}/ws`;
}

function open(url: string): WSConnection {
  connection = createWSConnection({
    url,
    socketFactory: (target) => {
      const socket = new WebSocket(target);
      sockets.push(socket);
      return socket as unknown as WSClientSocket;
    },
  });
  return connection;
}

describe("a socket let go of while it opens", () => {
  it("is closed without an error escaping when the connection is closed", async () => {
    const url = await silentServer();
    const conn = open(url);
    await vi.waitFor(() => expect(accepted).toHaveLength(1));

    conn.close();

    await vi.waitFor(() => expect(sockets[0]?.readyState).toBe(WebSocket.CLOSED));
    expect(conn.state).toEqual({ phase: "closed", by: "client" });
  });

  it("is closed without an error escaping when the connection reconnects at once", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const url = await silentServer();
    const conn = open(url);
    await vi.waitFor(() => expect(accepted).toHaveLength(1));

    conn.close();
    connection = open(url);
    await vi.waitFor(() => expect(accepted).toHaveLength(2));

    await vi.waitFor(() => expect(sockets[0]?.readyState).toBe(WebSocket.CLOSED));
  });
});
