/**
 * Shutting a NestJS host down while Courier streams are open.
 *
 * `app.close()` waits for every open connection, and an SSE stream does not
 * end on its own: the close hung for as long as the stream's lifetime cap,
 * 30 minutes by default, and nothing could drain it because the middleware
 * kept its stream registry to itself. Detaching the WebSocket handler left
 * every accepted client connected the same way.
 *
 * Nest runs its middleware on the Express instance it creates, which is what
 * serves the middleware here.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { registerSources } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import express from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

import { courierSSEMiddleware, courierWSAttach } from "../src/index";

const { stream } = courier();
let server: Server | undefined;

const forever = stream.response<number>().implement(async function* (ctx) {
  for (let n = 0; !ctx.signal.aborted; n += 1) {
    yield { data: n };
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
});

beforeEach(() => {
  registerSources({ api: defineApi({ baseURL: "https://upstream.example", endpoints: { forever } }) });
});

afterEach(async () => {
  server?.closeAllConnections();
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
  server = undefined;
});

async function listen(configure: (s: Server) => void): Promise<string> {
  server = createServer();
  configure(server);
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  return `127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const timeout = (ms: number) => new Promise((resolve) => setTimeout(() => resolve("still open"), ms));

describe("draining a NestJS host's SSE streams", () => {
  it("tells each stream's client to come back later and lets the server close", async () => {
    const sse = courierSSEMiddleware();
    const host = await listen((s) => {
      const app = express();
      app.use("/api/sse", sse);
      s.on("request", app);
    });
    const response = await fetch(`http://${host}/api/sse?_s=api&_m=forever`, {
      headers: { accept: "text/event-stream" },
    });
    const received = response.text();
    await expect.poll(() => sse.sseConnections.count).toBe(1);

    await sse.shutdownSSE({ drainMs: 500 });
    const closed = await Promise.race([
      new Promise((resolve) => server?.close(() => resolve("closed"))),
      timeout(3000),
    ]);

    expect(closed).toBe("closed");
    expect(await received).toContain("event: courier:shutdown");
  });
});

describe("detaching the WebSocket handler", () => {
  it("closes the connections it accepted, telling clients the server is going away", async () => {
    let detach: () => Promise<void> = async () => undefined;
    const host = await listen((s) => {
      detach = courierWSAttach(s);
    });
    const client = new WebSocket(`ws://${host}/api/ws`);
    await new Promise((resolve) => client.once("open", resolve));
    const closed = new Promise<number>((resolve) => client.once("close", resolve));

    try {
      await detach();

      expect(await Promise.race([closed, timeout(3000)])).toBe(1012);
    } finally {
      client.terminate();
    }
  });
});
