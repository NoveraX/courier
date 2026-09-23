/**
 * `courierWSAttach` on a server the application also uses for WebSockets.
 *
 * It used to take every upgrade on the server. With the application's own
 * WebSocket beside it, both handlers accepted the same socket and the process
 * died on the first connection; alone, it gave a Courier connection to a
 * client that asked for any path; and it buffered frames up to 100 MiB before
 * the configured size limit was consulted.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { defineApi } from "@noverax/courier/define";
import { registerSources } from "@noverax/courier";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket, WebSocketServer } from "ws";

import { courierWSAttach } from "../src";

let server: Server | undefined;
const clients: WebSocket[] = [];

beforeEach(() => {
  registerSources({ api: defineApi({ baseURL: "https://upstream.example", endpoints: {} }) });
});

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

/** "open", the first message, the close code, or the HTTP status an upgrade gets. */
function outcome(url: string, waitForMessage = false): Promise<string> {
  return new Promise((resolve) => {
    const client = new WebSocket(url);
    clients.push(client);
    client.on("open", () => {
      if (!waitForMessage) resolve("open");
    });
    client.on("message", (data) => resolve(`message:${String(data)}`));
    client.on("close", (code) => resolve(`close:${code}`));
    client.on("unexpected-response", (_req, res) => resolve(`status:${res.statusCode}`));
    client.on("error", () => undefined);
  });
}

describe("courierWSAttach beside the application's own WebSocket", () => {
  it("leaves the application's path to the application", async () => {
    const url = await listen((s) => {
      courierWSAttach(s, { allowedOrigins: ["*"] });
      const app = new WebSocketServer({ noServer: true });
      s.on("upgrade", (req, socket, head) => {
        if (req.url !== "/my-ws") return;
        app.handleUpgrade(req, socket, head, (ws) => ws.send("app"));
      });
    });

    expect(await outcome(`${url}/my-ws`, true)).toBe("message:app");
    expect(await outcome(`${url}/api/ws`)).toBe("open");
  });

  it("answers its own path when told another one", async () => {
    const url = await listen((s) => courierWSAttach(s, { path: "/realtime" }));

    expect(await outcome(`${url}/realtime`)).toBe("open");
    expect(await outcome(`${url}/api/ws`)).toBe("status:404");
  });

  it("does not answer a path nobody serves", async () => {
    const url = await listen((s) => courierWSAttach(s));
    expect(await outcome(`${url}/socket.io/`)).toBe("status:404");
  });
});

describe("courierWSAttach and the frame limit", () => {
  it("closes a connection whose frame exceeds maxMessageSize, before buffering it", async () => {
    const url = await listen((s) => courierWSAttach(s, { maxMessageSize: 1024 }));
    const client = new WebSocket(`${url}/api/ws`);
    clients.push(client);
    await new Promise((resolve) => client.on("open", resolve));

    const code = await new Promise<number>((resolve) => {
      client.on("close", resolve);
      client.send("x".repeat(64 * 1024));
    });

    expect(code).toBe(1009);
  });
});
