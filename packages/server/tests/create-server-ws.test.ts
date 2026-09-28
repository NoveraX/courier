/**
 * The WebSocket options a standalone server passes to its handler. Only the
 * heartbeat, pub/sub and connection hooks reached it, so per-address limits,
 * message limits and authorization could not be configured at all: 51
 * clients behind one address were refused for good.
 */
import { courier, defineApi } from "@noverax/courier/define";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

import { createCourierServer } from "../src/create-server";
import type { CourierServer, CourierServerOptions } from "../src/types";

const { channel } = courier();

let server: CourierServer | undefined;
const clients: WebSocket[] = [];

afterEach(async () => {
  for (const client of clients.splice(0)) client.terminate();
  await server?.stop();
  server = undefined;
});

const feed = channel.response<string>().implement(async function* () {
  yield "hello";
  await new Promise(() => {});
});

async function serve(options: Partial<CourierServerOptions>): Promise<string> {
  const live = defineApi({ baseURL: "http://127.0.0.1:1", endpoints: { feed } });
  server = createCourierServer({
    sources: { live },
    port: 0,
    host: "127.0.0.1",
    signals: false,
    ...options,
  });
  return (await server.ready).replace("http", "ws");
}

/** Open a client and report how its first moment went: "open" or the close code. */
function connect(url: string): Promise<WebSocket> {
  const client = new WebSocket(url);
  clients.push(client);
  return new Promise((resolve, reject) => {
    client.once("open", () => resolve(client));
    client.once("error", reject);
  });
}

/** The first message the server sends back, parsed. */
function nextMessage(client: WebSocket): Promise<{ type: string; error?: { code: number } }> {
  return new Promise((resolve) => {
    client.once("message", (data) => resolve(JSON.parse(String(data))));
  });
}

/** Whether the server closes the client within `ms`, and with which code. */
function closedWithin(client: WebSocket, ms: number): Promise<number | "open"> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("open"), ms);
    client.once("close", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

describe("WebSocket options", () => {
  it("admits more clients from one address when maxConnectionsPerIP is raised", async () => {
    const url = await serve({ maxConnectionsPerIP: 60 });

    const opened = await Promise.all(Array.from({ length: 55 }, () => connect(url)));
    const outcomes = await Promise.all(opened.map((client) => closedWithin(client, 300)));

    expect(outcomes.filter((outcome) => outcome !== "open")).toEqual([]);
  });

  it("refuses a client over a lowered maxConnectionsPerIP", async () => {
    const url = await serve({ maxConnectionsPerIP: 1 });
    await connect(url);

    const second = await connect(url);

    expect(await closedWithin(second, 1000)).toBe(4429);
  });

  it("asks authorize before a subscription starts", async () => {
    const url = await serve({ authorize: () => false });
    const client = await connect(url);

    const reply = nextMessage(client);
    client.send(JSON.stringify({ type: "subscribe", id: "s1", topic: "live.feed" }));

    expect(await reply).toMatchObject({ type: "complete", error: { code: 4403 } });
  });

  it("refuses an oversized message by default and keeps the connection's subscriptions", async () => {
    const url = await serve({});
    const client = await connect(url);
    const subscribed = nextMessage(client);
    client.send(JSON.stringify({ type: "subscribe", id: "s1", topic: "live.feed" }));
    expect(await subscribed).toMatchObject({ type: "subscribed" });
    const errors: unknown[] = [];
    client.on("message", (data) => {
      const message = JSON.parse(String(data)) as { type: string };
      if (message.type === "error") errors.push(message);
    });

    client.send(JSON.stringify({ type: "ping", pad: "x".repeat(70_000) }));
    const outcome = await closedWithin(client, 500);

    expect(outcome).toBe("open");
    expect(errors).toEqual([expect.objectContaining({ error: expect.objectContaining({ code: 4413 }) })]);
    const pong = nextMessage(client);
    client.send(JSON.stringify({ type: "ping" }));
    expect(await pong).toMatchObject({ type: "pong" });
  });

  it("closes a connection whose frame exceeds maxPayload, before buffering it", async () => {
    const url = await serve({ maxPayload: 4096 });
    const client = await connect(url);

    client.send("x".repeat(64 * 1024));

    expect(await closedWithin(client, 1000)).toBe(1009);
  });

  it("reads a frame up to twice a raised maxMessageSize, to refuse it with an error", async () => {
    const url = await serve({ maxMessageSize: 2 * 1024 * 1024 });
    const client = await connect(url);

    const reply = nextMessage(client);
    client.send(JSON.stringify({ type: "ping", pad: "x".repeat(3 * 1024 * 1024) }));

    expect(await reply).toMatchObject({ type: "error", error: { code: 4413 } });
  });

  it("refuses a message over maxMessageSize with an error", async () => {
    const url = await serve({ maxMessageSize: 256 });
    const client = await connect(url);

    const reply = nextMessage(client);
    client.send(JSON.stringify({ type: "ping", pad: "x".repeat(1024) }));

    expect(await reply).toMatchObject({ type: "error", error: { code: 4413 } });
  });
});

describe("the metadata a standalone server's WebSocket hooks receive", () => {
  it("is typed from what onConnect returns", () => {
    /* Only compiled: a server made here would listen on a port. */
    function typed(): void {
      createCourierServer({
        sources: {},
        onConnect: () => ({ userId: "u1" }),
        onDisconnect: ({ meta }) => {
          const userId: string = meta.userId;
          expect(userId).toBeTypeOf("string");
        },
      });
    }

    expect(typed).toBeTypeOf("function");
  });
});
