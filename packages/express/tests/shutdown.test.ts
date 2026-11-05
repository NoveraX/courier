/**
 * Shutting an Express host down while Courier streams are open.
 *
 * `server.close()` waits for every connection to end, and an SSE stream does
 * not end on its own, so the handler's streams can be drained: each client
 * is told to come back later and the server closes, rather than hanging for
 * the stream's lifetime cap, 30 minutes by default. Detaching the WebSocket
 * handler closes the connections it accepted, telling clients the server is
 * going away, and ends those whose clients do not answer within its drain.
 */
import { createServer, type Server } from "node:http";
import { type AddressInfo, connect, type Socket } from "node:net";
import { registerSources } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import express from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

import { courierHandler, courierSSEHandler, courierWSAttach } from "../src";

/** The first frame a Courier client sends: `auth`, of protocol version 2. */
const AUTH = JSON.stringify({ type: "auth", v: 2, id: "a0" });

const { stream } = courier();
let server: Server | undefined;

const forever = stream.response<number>().implement(async function* (ctx) {
  for (let n = 0; !ctx.signal.aborted; n += 1) {
    yield { data: n };
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
});

beforeEach(() => {
  registerSources({
    api: defineApi({ expose: true, baseURL: "https://upstream.example", endpoints: { forever } }),
  });
});

afterEach(async () => {
  server?.closeAllConnections();
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
  server = undefined;
});

async function listen(app: ReturnType<typeof express>): Promise<string> {
  server = createServer(app);
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  return `127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** Open a stream and read it to the end, collecting what arrived. */
async function openStream(url: string): Promise<{ first: string; rest: Promise<string> }> {
  const response = await fetch(url, { headers: { accept: "text/event-stream" } });
  const reader = response.body?.getReader();
  if (!reader) throw new Error("the stream has no body");
  const decoder = new TextDecoder();
  const first = decoder.decode((await reader.read()).value);
  const rest = (async () => {
    let text = "";
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      text += decoder.decode(chunk.value);
    }
    return text;
  })();
  return { first, rest };
}

function closeServer(): Promise<string> {
  return new Promise((resolve) => server?.close(() => resolve("closed")));
}

const timeout = (ms: number) =>
  new Promise((resolve) => setTimeout(() => resolve("still open"), ms));

/** A client that takes the upgrade and then sends nothing, not even the close it is asked for. */
async function silentPeer(host: string): Promise<Socket> {
  const [hostname, port] = host.split(":");
  const socket = connect(Number(port), hostname);
  await new Promise((resolve) => socket.once("connect", resolve));
  socket.write(
    `GET /api/ws HTTP/1.1\r\nHost: ${host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
      "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n",
  );
  await new Promise((resolve) => socket.once("data", resolve));
  return socket;
}

describe("draining an Express host's SSE streams", () => {
  it("tells each stream's client to come back later and lets the server close", async () => {
    const sse = courierSSEHandler();
    const app = express();
    app.get("/api/sse", sse);
    const host = await listen(app);
    const opened = await openStream(`http://${host}/api/sse?_s=api&_m=forever`);

    await sse.shutdownSSE({ retryMs: 1000, drainMs: 500 });
    const closed = await Promise.race([closeServer(), timeout(3000)]);

    expect(opened.first).toContain("data: 0");
    expect(closed).toBe("closed");
    expect(await opened.rest).toContain("event: courier:shutdown");
  });

  it("counts the streams it serves until they are drained", async () => {
    const sse = courierSSEHandler();
    const app = express();
    app.get("/api/sse", sse);
    const host = await listen(app);
    await openStream(`http://${host}/api/sse?_s=api&_m=forever`);

    expect(sse.sseConnections.count).toBe(1);
    await sse.shutdownSSE({ drainMs: 500 });
    expect(sse.sseConnections.count).toBe(0);
  });

  it("drains a stream served by the proxy route itself", async () => {
    const proxy = courierHandler();
    const app = express();
    app.get("/api/request", proxy);
    const host = await listen(app);
    const opened = await openStream(`http://${host}/api/request?_s=api&_m=forever`);

    await proxy.shutdownSSE({ drainMs: 500 });

    expect(await opened.rest).toContain("event: courier:shutdown");
  });
});

describe("detaching the WebSocket handler", () => {
  it("closes the connections it accepted, telling clients the server is going away", async () => {
    server = createServer();
    const detach = courierWSAttach(server);
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const client = new WebSocket(`ws://127.0.0.1:${(server.address() as AddressInfo).port}/api/ws`);
    await new Promise((resolve) => client.once("open", resolve));
    const admitted = new Promise((resolve) => client.once("message", resolve));
    client.send(AUTH);
    await admitted;
    const closed = new Promise<number>((resolve) => client.once("close", resolve));

    try {
      await detach();

      expect(await Promise.race([closed, timeout(3000)])).toBe(1001);
    } finally {
      client.terminate();
    }
  });

  it("ends a connection whose client never answers its close, so the server can close", async () => {
    server = createServer();
    const detach = courierWSAttach(server);
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const peer = await silentPeer(`127.0.0.1:${(server.address() as AddressInfo).port}`);
    const ended = new Promise((resolve) => peer.once("close", () => resolve("ended")));

    try {
      await detach();

      /* Left to `ws`, it would end 30 seconds after the handler's 5-second drain. */
      expect(await Promise.race([ended, timeout(1000)])).toBe("ended");
      expect(await Promise.race([closeServer(), timeout(1000)])).toBe("closed");
    } finally {
      peer.destroy();
    }
  }, 15_000);
});
