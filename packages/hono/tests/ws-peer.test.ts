/**
 * Counting WebSocket connections per caller behind Hono.
 *
 * A Web `Request` carries no peer address, and the Hono adapter handed the
 * WebSocket handler nothing else, so every caller without forwarding headers
 * was counted as "0.0.0.0". The per-address cap — 50 by default — then
 * capped the whole server: the fifty-first connection from anyone was closed
 * with 4429, and one client could lock every other user out.
 */
import type { AddressInfo } from "node:net";
import { serve, upgradeWebSocket } from "@hono/node-server";
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
  const ws = courierWSHandler({ maxConnectionsPerIP, allowedOrigins: ["*"] });
  app.get("/api/ws", upgradeWebSocket((c) => ws(c)));
  const wss = new WebSocketServer({ noServer: true });
  const server = serve({ fetch: app.fetch, port: 0, hostname: "::", websocket: { server: wss } });
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  close = () =>
    new Promise<void>((resolve) => {
      wss.close();
      server.close(() => resolve());
    });
  return (server.address() as AddressInfo).port;
}

/** "open", or the close code a connection from `host` gets. */
function connect(host: string, port: number): Promise<string> {
  return new Promise((resolve) => {
    const client = new WebSocket(`ws://${host}:${port}/api/ws`);
    clients.push(client);
    const opened = setTimeout(() => resolve("open"), 300);
    client.on("close", (code) => {
      clearTimeout(opened);
      resolve(`close:${code}`);
    });
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

    expect(outcomes.filter((outcome) => outcome === "close:4429")).toHaveLength(1);
  });
});
