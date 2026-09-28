/**
 * WebSocket upgrades on a Node HTTP server shared with the application.
 *
 * Every upgrade on the server used to be taken, whatever its path. An
 * application with a WebSocket of its own then had two handlers accept one
 * socket and the process died on its first connection; with nothing else
 * listening, a client that opened any path got a Courier connection. Frames
 * were buffered up to `ws`'s 100 MiB default before the size limit was read.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket, WebSocketServer } from "ws";

import { attachWebSocketUpgrade, type UpgradeServer } from "../src/node";

let server: Server | undefined;
const clients: WebSocket[] = [];

afterEach(async () => {
  for (const client of clients.splice(0)) client.terminate();
  server?.closeAllConnections();
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
  server = undefined;
});

async function listen(configure: (s: Server) => void): Promise<string> {
  server = createServer();
  configure(server);
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  return `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** Accept with Courier's handler and answer each connection with a word. */
function courier(s: Server, extra: { maxPayload?: number; isAccepting?: () => boolean } = {}) {
  return attachWebSocketUpgrade(s, {
    path: "/api/ws",
    createServer: (options) => new WebSocketServer(options) as unknown as UpgradeServer,
    onSocket: (socket) => socket.send("courier"),
    ...extra,
  });
}

/** The first message, the close code, or the HTTP status an upgrade gets. */
function outcome(url: string): Promise<string> {
  return new Promise((resolve) => {
    const client = new WebSocket(url);
    clients.push(client);
    client.on("message", (data) => resolve(`message:${String(data)}`));
    client.on("close", (code) => resolve(`close:${code}`));
    client.on("unexpected-response", (_req, res) => resolve(`status:${res.statusCode}`));
    client.on("error", () => undefined);
  });
}

describe("which upgrades Courier answers", () => {
  it("answers its own path", async () => {
    const url = await listen((s) => courier(s));
    expect(await outcome(`${url}/api/ws`)).toBe("message:courier");
  });

  it("leaves another path to the application's own WebSocket", async () => {
    const url = await listen((s) => {
      courier(s);
      const app = new WebSocketServer({ noServer: true });
      s.on("upgrade", (req, socket, head) => {
        if (req.url !== "/my-ws") return;
        app.handleUpgrade(req, socket, head, (ws) => ws.send("app"));
      });
    });

    expect(await outcome(`${url}/my-ws`)).toBe("message:app");
    expect(await outcome(`${url}/api/ws`)).toBe("message:courier");
  });

  it("answers 404 on another path when nothing else listens", async () => {
    const url = await listen((s) => courier(s));
    expect(await outcome(`${url}/socket.io/`)).toBe("status:404");
  });

  it("answers 503 while the server is not accepting", async () => {
    const url = await listen((s) => courier(s, { isAccepting: () => false }));
    expect(await outcome(`${url}/api/ws`)).toBe("status:503");
  });
});

describe("the frame limit", () => {
  it("closes a connection that sends a frame over it, before buffering it all", async () => {
    const url = await listen((s) => courier(s, { maxPayload: 1024 }));
    const client = new WebSocket(`${url}/api/ws`);
    clients.push(client);
    await new Promise((resolve) => client.on("message", resolve));

    const code = await new Promise<number>((resolve) => {
      client.on("close", resolve);
      client.send("x".repeat(64 * 1024));
    });

    expect(code).toBe(1009);
  });

  it("logs why the frame was refused, not [object Object]", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const url = await listen((s) => courier(s, { maxPayload: 1024 }));
    const client = new WebSocket(`${url}/api/ws`);
    clients.push(client);
    await new Promise((resolve) => client.on("message", resolve));

    await new Promise<number>((resolve) => {
      client.on("close", resolve);
      client.send("x".repeat(64 * 1024));
    });
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());

    const reason = warn.mock.calls.map((call) => call[2]).find((cause) => cause instanceof Error);
    expect((reason as Error).message).toMatch(/Max payload size exceeded/);
    warn.mockRestore();
  });
});

describe("detaching", () => {
  it("closes each connection it accepted with 1012, so the client reconnects later", async () => {
    let detach: () => void = () => undefined;
    const url = await listen((s) => {
      detach = courier(s);
    });
    const client = new WebSocket(`${url}/api/ws`);
    clients.push(client);
    await new Promise((resolve) => client.once("message", resolve));
    const closed = new Promise<number>((resolve) => client.once("close", resolve));

    detach();

    expect(await closed).toBe(1012);
  });
});
