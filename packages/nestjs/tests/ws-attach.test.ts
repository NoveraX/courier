/**
 * The message limit of `courierWSAttach` on a NestJS application's server.
 *
 * The `ws` frame limit used to equal `maxMessageSize`, so a message over it
 * closed the whole socket with 1009 and ended every subscription on it,
 * before the handler could refuse the one message with a 4413.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { registerSources } from "@noverax/courier";
import { defineApi } from "@noverax/courier/define";
import { wsFrameLimit } from "@noverax/courier/node";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

import { courierWSAttach } from "../src/index";

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

async function open(): Promise<WebSocket> {
  server = createServer();
  courierWSAttach(server, { maxMessageSize: 1024 });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const client = new WebSocket(`ws://127.0.0.1:${(server.address() as AddressInfo).port}/api/ws`);
  clients.push(client);
  await new Promise((resolve) => client.on("open", resolve));
  return client;
}

describe("courierWSAttach and the message limit", () => {
  it("refuses a message over maxMessageSize with 4413 and keeps the connection", async () => {
    const client = await open();
    const frames: { type: string; error?: { code: number } }[] = [];
    client.on("message", (raw) => frames.push(JSON.parse(String(raw)) as { type: string }));

    client.send("x".repeat(64 * 1024));
    client.send(JSON.stringify({ type: "ping" }));
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(frames.map((frame) => frame.error?.code ?? frame.type)).toEqual([4413, "pong"]);
    expect(client.readyState).toBe(WebSocket.OPEN);
  });

  it("closes a connection whose frame exceeds the frame limit, before buffering it", async () => {
    const client = await open();

    const code = await new Promise<number>((resolve) => {
      client.on("close", resolve);
      client.send("x".repeat(wsFrameLimit(1024) + 1));
    });

    expect(code).toBe(1009);
  });
});

describe("the metadata the attached handler's hooks receive", () => {
  it("is typed from what onConnect returns", () => {
    /* Only compiled: the hooks are what the compiler is asked about. */
    function typed(): void {
      courierWSAttach(createServer(), {
        onConnect: async () => ({ userId: "u1" }),
        authorize: ({ meta }) => meta.userId.length > 0,
      });
    }

    expect(typed).toBeTypeOf("function");
  });
});
