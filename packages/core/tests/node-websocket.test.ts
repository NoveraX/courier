/**
 * WebSocket upgrades on a Node HTTP server shared with the application.
 *
 * Only upgrades to Courier's path are taken, so an application's own
 * WebSocket is not accepted by two handlers — which kills the process on its
 * first connection — and a client opening any other path gets no Courier
 * connection. Frames are limited before they are buffered, not at `ws`'s
 * 100 MiB default.
 */
import { createServer, type Server } from "node:http";
import { type AddressInfo, connect, type Socket } from "node:net";
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

/** Open a Courier connection over a bare TCP socket, so the test can reset it. */
async function rawUpgrade(url: string): Promise<Socket> {
  const { hostname, port } = new URL(url);
  const socket = connect(Number(port), hostname);
  await new Promise((resolve) => socket.once("connect", resolve));
  socket.write(
    "GET /api/ws HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
      "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n",
  );
  await new Promise<void>((resolve) => {
    socket.on("data", (chunk) => {
      if (String(chunk).includes("courier")) resolve();
    });
  });
  return socket;
}

describe("a client that drops the connection", () => {
  it("is not reported as an upgrade failure once the connection was accepted", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let closed!: () => void;
    const socketClosed = new Promise<void>((resolve) => {
      closed = resolve;
    });
    const url = await listen((s) =>
      attachWebSocketUpgrade(s, {
        path: "/api/ws",
        createServer: (options) => new WebSocketServer(options) as unknown as UpgradeServer,
        onSocket: (socket) => {
          socket.addEventListener("close", () => closed());
          socket.send("courier");
        },
      }),
    );
    const socket = await rawUpgrade(url);

    socket.resetAndDestroy();
    await socketClosed;
    await new Promise((resolve) => setTimeout(resolve, 20));

    const messages = warn.mock.calls.map((call) => call.map(String).join(" "));
    expect(messages.filter((line) => line.includes("upgrade socket error"))).toEqual([]);
    warn.mockRestore();
  });
});

/** The status line a hand-written upgrade request is answered with. */
async function rawStatus(url: string, target: string, host: string): Promise<string> {
  const { hostname, port } = new URL(url);
  const socket = connect(Number(port), hostname);
  await new Promise((resolve) => socket.once("connect", resolve));
  socket.write(
    `GET ${target} HTTP/1.1\r\nHost: ${host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
      "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n",
  );
  const answer = await new Promise<string>((resolve) => {
    socket.once("data", (chunk) => resolve(String(chunk).split("\r\n")[0] ?? ""));
    socket.once("close", () => resolve("closed"));
  });
  socket.destroy();
  return answer;
}

describe("an upgrade request no URL reads", () => {
  it("is refused 400 for a target, and the server goes on serving", async () => {
    const url = await listen((s) => courier(s));

    expect(await rawStatus(url, "http://[::1/api/ws", "127.0.0.1")).toBe(
      "HTTP/1.1 400 Bad Request",
    );
    expect(await outcome(`${url}/api/ws`)).toBe("message:courier");
  });

  it("is refused 400 for a Host, before the protocol is switched", async () => {
    const url = await listen((s) => courier(s));

    expect(await rawStatus(url, "/api/ws", "exa mple.com")).toBe("HTTP/1.1 400 Bad Request");
    expect(await outcome(`${url}/api/ws`)).toBe("message:courier");
  });

  it("is left to another listener the application attached", async () => {
    const url = await listen((s) => {
      courier(s);
      s.on("upgrade", (_req, socket) => {
        socket.end("HTTP/1.1 418 I'm a teapot\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
      });
    });

    expect(await rawStatus(url, "http://[::1/elsewhere", "127.0.0.1")).toBe(
      "HTTP/1.1 418 I'm a teapot",
    );
  });
});
