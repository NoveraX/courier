/**
 * Counting WebSocket connections per caller behind Hono.
 *
 * A Web `Request` carries no peer address, so the Hono adapter hands the
 * WebSocket handler the peer's own address: counted as one "0.0.0.0",
 * every caller without forwarding headers would share the per-address cap —
 * 50 by default — and one client could lock every other user out, the
 * fifty-first connection from anyone closed with 4429.
 */
import type { AddressInfo } from "node:net";
import { serve, upgradeWebSocket, type WebSocketServerLike } from "@hono/node-server";
import { registerSources } from "@noverax/courier";
import { defineApi } from "@noverax/courier/define";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket, WebSocketServer } from "ws";

import { courierWSHandler } from "../src/index";

const clients: WebSocket[] = [];
let close: (() => Promise<void>) | undefined;

beforeEach(() => {
  registerSources({ api: defineApi({ baseURL: "https://upstream.example", endpoints: {} }) });
});

afterEach(async () => {
  for (const client of clients.splice(0)) client.terminate();
  await close?.();
  close = undefined;
});

async function listen(maxConnectionsPerIP: number): Promise<number> {
  const app = new Hono();
  const ws = courierWSHandler({ maxConnectionsPerIP });
  app.get(
    "/api/ws",
    upgradeWebSocket((c) => ws(c)),
  );
  const wss = new WebSocketServer({ noServer: true });
  const server = serve({
    fetch: app.fetch,
    port: 0,
    hostname: "::",
    websocket: { server: asHonoServer(wss) },
  });
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  close = () =>
    new Promise<void>((resolve) => {
      wss.close();
      server.close(() => resolve());
    });
  return (server.address() as AddressInfo).port;
}

/**
 * "open", the close code a connection from `host` gets, or "silent" when it
 * gets neither within two seconds. A connection over the cap is closed as the
 * server takes it and answers nothing, while one it keeps answers a ping — so
 * a busy machine, slow to close, cannot pass a refused connection off as open,
 * as a fixed wait for the close did, and a server that answers neither fails
 * the test by what it did rather than by the test's own time running out.
 */
function connect(host: string, port: number): Promise<string> {
  return new Promise((resolve) => {
    const client = new WebSocket(`ws://${host}:${port}/api/ws`);
    clients.push(client);
    const silent = setTimeout(() => resolve("silent"), 2000);
    const finish = (outcome: string): void => {
      clearTimeout(silent);
      resolve(outcome);
    };
    client.on("open", () => client.send(JSON.stringify({ type: "ping" })));
    client.on("message", (frame) => {
      if ((JSON.parse(String(frame)) as { type?: string }).type === "pong") finish("open");
    });
    client.on("close", (code) => finish(`close:${code}`));
    client.on("error", () => undefined);
  });
}

describe("the per-address WebSocket cap behind Hono", () => {
  it("counts each caller against its own address", async () => {
    const port = await listen(2);

    const outcomes = await Promise.all([
      connect("127.0.0.1", port),
      connect("127.0.0.1", port),
      connect("[::1]", port),
      connect("[::1]", port),
    ]);

    expect(outcomes).toEqual(["open", "open", "open", "open"]);
  });

  it("still caps one caller at its limit", async () => {
    const port = await listen(2);

    const outcomes = await Promise.all([
      connect("127.0.0.1", port),
      connect("127.0.0.1", port),
      connect("127.0.0.1", port),
    ]);

    /* Which of the three is refused is a race; that the other two are kept is not. */
    expect([...outcomes].sort()).toEqual(["close:4429", "open", "open"]);
  });
});

/* The server `@hono/node-server` documents passing. Its `WebSocketServerLike`
   writes optional members without `| undefined` and `ws` writes them with it,
   so under exact optional property types the two declarations do not meet,
   from `options.noServer` down to `send`'s options. The directive fails the
   check once they do. */
function asHonoServer(wss: WebSocketServer): WebSocketServerLike {
  // @ts-expect-error — the declarations differ only in `| undefined`
  return wss;
}
