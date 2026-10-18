/**
 * A stream Studio watches tells how its connection stands: being opened,
 * open, or being opened again — with how many connections in a row failed,
 * why the last one ended and when the next one opens — rather than standing
 * open while the client reconnects without a word. Each cause is the one a
 * real failure gives: a port nothing listens on, a server that refuses, one
 * that drops the stream or falls silent, a socket that never opens.
 */
import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket as WsSocket } from "ws";
import { z } from "zod";

import { createHandler } from "../src/adapter";
import { courier, defineApi, defineGroup } from "../src/define";
import { sendWebResponse, toWebRequest } from "../src/node";
import { clearWSConnectionPool } from "../src/realtime/caller-ws";
import { subscribeSSE } from "../src/realtime/sse";
import type { ConnectionStatus, SSESubscription } from "../src/realtime/types";
import type { WSClientSocket } from "../src/realtime/ws/ws-types";
import { executeWSChannel } from "../src/realtime/ws-channel-client";
import { executeWSPush } from "../src/realtime/ws-subscription";
import { studioHooks } from "../src/studio";
import type { StudioHooks } from "../src/studio/hooks";
import type { StreamStatusEvent } from "../src/studio/hooks-stream";
import { instrumentSSE, instrumentWSChannel, instrumentWSPush } from "../src/transport/instrument";
import { type ServedWS, serveWS, stopWS } from "./helpers/ws-server";

const { stream, channel } = courier();
const FAST = { initialMs: 5, maxMs: 5, jitter: false };
const META = {
  source: "api",
  group: "live",
  method: "feed",
  transport: "sse" as const,
  mode: "direct" as const,
};

let original: StudioHooks;
let statuses: StreamStatusEvent[];
const closers: Array<() => Promise<void> | void> = [];

beforeEach(() => {
  original = { ...studioHooks };
  statuses = [];
  studioHooks.onStreamOpen = vi.fn();
  studioHooks.onStreamStatus = (event) => statuses.push(event);
});

afterEach(async () => {
  for (const close of closers.splice(0).reverse()) await close();
  clearWSConnectionPool();
  for (const key of Object.keys(studioHooks) as Array<keyof StudioHooks>) delete studioHooks[key];
  Object.assign(studioHooks, original);
});

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  closers.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return (server.address() as AddressInfo).port;
}

/** A port that refuses connections: a server's, once it has stopped listening. */
async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function serveEvents(answer: (res: ServerResponse, count: number) => void): Promise<string> {
  let count = 0;
  const port = await listen(createServer((_req, res) => answer(res, ++count)));
  return `http://127.0.0.1:${port}/feed`;
}

function watched(subscription: SSESubscription): SSESubscription {
  const instrumented = instrumentSSE(subscription, META);
  closers.push(() => instrumented.close());
  return instrumented;
}

const reconnects = () => statuses.filter((event) => event.status === "reconnecting");

describe("a stream whose connection cannot be made", () => {
  it("tells it is being opened, then why each connection failed, and how many in a row", async () => {
    const url = `http://127.0.0.1:${await closedPort()}/feed`;

    watched(subscribeSSE(url, { backoff: FAST }));
    await expect.poll(() => reconnects().length, { timeout: 5_000 }).toBeGreaterThanOrEqual(2);

    expect(statuses[0]).toMatchObject({ status: "connecting" });
    expect(reconnects().slice(0, 2)).toEqual([
      expect.objectContaining({
        failures: 1,
        retryIn: 5,
        cause: { code: "ECONNREFUSED", message: expect.stringContaining("ECONNREFUSED") },
      }),
      expect.objectContaining({
        failures: 2,
        cause: expect.objectContaining({ code: "ECONNREFUSED" }),
      }),
    ]);
    expect(statuses.some((event) => event.status === "open")).toBe(false);
  });

  it("says the status a server refused it with, and waits as long as it asked", async () => {
    const url = await serveEvents((res) => {
      res.writeHead(503, { "retry-after": "1" });
      res.end();
    });

    watched(subscribeSSE(url, { backoff: FAST }));
    await expect.poll(() => reconnects().length, { timeout: 5_000 }).toBe(1);

    expect(reconnects()[0]).toMatchObject({
      failures: 1,
      retryIn: 1000,
      cause: { message: "503 Service Unavailable" },
    });
  });
});

describe("a stream whose connection opens", () => {
  it("tells it open, why it ended after it delivered, and open again", async () => {
    const url = await serveEvents((res, count) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(`data: ${count}\n\n`);
      if (count === 1) res.end();
    });

    watched(subscribeSSE(url, { backoff: FAST }));
    await expect
      .poll(() => statuses.map((event) => event.status), { timeout: 5_000 })
      .toEqual(["connecting", "open", "reconnecting", "open"]);

    expect(reconnects()[0]).toMatchObject({
      openedBefore: true,
      failures: 0,
      cause: { message: "The connection closed before the stream ended" },
    });
  });

  it("says a server fell silent", async () => {
    const url = await serveEvents((res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write("data: 1\n\n");
    });

    watched(subscribeSSE(url, { backoff: FAST, heartbeatTimeout: 50 }));
    await expect.poll(() => reconnects().length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);

    expect(reconnects()[0]).toMatchObject({
      failures: 0,
      cause: { message: "No event or heartbeat came for 50 ms" },
    });
  });

  it("tells nothing more once it has closed", async () => {
    const url = await serveEvents((res, count) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(`data: ${count}\n\n`);
      res.end();
    });
    const subscription = watched(subscribeSSE(url, { backoff: { initialMs: 50, maxMs: 50 } }));
    await expect.poll(() => reconnects().length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);

    subscription.close();
    const told = statuses.length;
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(statuses).toHaveLength(told);
  });
});

describe("a stream a Courier server serves", () => {
  it("is told open at once, though it has nothing to send yet", async () => {
    let release = () => {};
    const parked = new Promise<void>((resolve) => {
      release = resolve;
    });
    closers.push(() => release());
    const api = defineApi({
      expose: true,
      name: "api",
      baseURL: "http://127.0.0.1:1",
      groups: {
        live: defineGroup({
          endpoints: {
            quiet: stream.response<number>().implement(async function* () {
              await parked;
              yield { data: 1 };
            }),
          },
        }),
      },
    });
    const handler = createHandler({ sources: { api } });
    const port = await listen(
      createServer(async (req, res) => {
        await sendWebResponse(await handler.handle(toWebRequest(req, res)), res);
      }),
    );
    delete studioHooks.onStreamOpen;
    delete studioHooks.onStreamStatus;

    const subscription = subscribeSSE(`http://127.0.0.1:${port}/api/sse?_s=api&_g=live&_m=quiet`);
    closers.push(() => subscription.close());

    await expect.poll(() => subscription.status, { timeout: 5_000 }).toBe("connected");
  });
});

describe("a stream that has closed", () => {
  it("tells nothing more of a connection its source goes on reporting", () => {
    let report: (status: ConnectionStatus) => void = () => {};
    const source: SSESubscription = {
      async *[Symbol.asyncIterator]() {},
      close() {},
      status: "connecting",
      dropped: 0,
      on: (_event, handler) => {
        report = handler;
        return () => {};
      },
    };
    const instrumented = instrumentSSE(source, META);

    instrumented.close();
    report("reconnecting");
    report("connected");

    expect(statuses.map((event) => event.status)).toEqual(["connecting"]);
  });
});

describe("a stream that opens no connection", () => {
  it("tells nothing, and stands open", () => {
    const served: SSESubscription = {
      async *[Symbol.asyncIterator]() {},
      close() {},
      status: "connected",
      dropped: 0,
      on: () => () => {},
    };

    instrumentSSE(served, META);

    expect(statuses).toEqual([]);
  });
});

describe("a channel whose socket cannot be opened", () => {
  const WS_META = { ...META, transport: "ws" as const };

  it("says the socket closed before it opened, where the platform says no more", async () => {
    const url = `ws://127.0.0.1:${await closedPort()}/api/ws`;

    const ch = instrumentWSChannel(
      executeWSChannel(url, "api.live.room", undefined, { backoff: FAST }),
      WS_META,
    );
    closers.push(() => ch.close());
    await expect.poll(() => reconnects().length, { timeout: 5_000 }).toBeGreaterThanOrEqual(2);

    expect(statuses[0]).toMatchObject({ status: "connecting" });
    expect(reconnects().slice(0, 2)).toEqual([
      expect.objectContaining({
        failures: 1,
        cause: { message: "The socket closed with code 1006 before it opened" },
      }),
      expect.objectContaining({ failures: 2 }),
    ]);
  });

  it("says the same of a push subscription, whose socket is the connection's", async () => {
    const url = `ws://127.0.0.1:${await closedPort()}/api/ws`;

    const push = instrumentWSPush(
      executeWSPush(url, "api.live.ticks", undefined, { backoff: FAST }),
      WS_META,
      "req_push",
    );
    closers.push(() => push.close());
    await expect.poll(() => reconnects().length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);

    expect(reconnects()[0]).toMatchObject({
      requestId: "req_push",
      failures: 1,
      cause: { message: "The socket closed with code 1006 before it opened" },
    });
  });

  it("gives the platform's code and text, where its socket's error event carries them", async () => {
    const url = `ws://127.0.0.1:${await closedPort()}/api/ws`;
    const socketFactory = (target: string) => new WsSocket(target) as unknown as WSClientSocket;

    const ch = instrumentWSChannel(
      executeWSChannel(url, "api.live.room", undefined, { backoff: FAST, socketFactory }),
      WS_META,
    );
    closers.push(() => ch.close());
    await expect.poll(() => reconnects().length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);

    expect(reconnects()[0]).toMatchObject({
      failures: 1,
      cause: { code: "ECONNREFUSED", message: expect.stringContaining("ECONNREFUSED") },
    });
  });
});

describe("a channel whose socket opens", () => {
  let served: ServedWS | undefined;

  afterEach(async () => {
    await stopWS(served);
    served = undefined;
  });

  it("tells it is being opened, then open", async () => {
    served = await serveWS({
      room: channel
        .variables(z.object({ room: z.string() }))
        .send(z.object({ text: z.string() }))
        .response<string>()
        .implement(() => ({
          onJoin: (ctx) => ctx.send("welcome"),
          onMessage: (ctx, message) => ctx.send(message.text),
        })),
    });

    const ch = instrumentWSChannel(
      executeWSChannel(served.url, "api.live.room", { room: "r1" }, { backoff: FAST }),
      { ...META, transport: "ws" },
    );
    closers.push(() => ch.close());

    await expect
      .poll(() => statuses.map((event) => event.status), { timeout: 5_000 })
      .toEqual(["connecting", "open"]);
  });

  it("says why its credentials could not be had, counting from the socket that delivered", async () => {
    served = await serveWS({
      room: channel
        .variables(z.object({ room: z.string() }))
        .send(z.object({ text: z.string() }))
        .response<string>()
        .implement(() => ({
          onJoin: (ctx) => ctx.send("welcome"),
          onMessage: (ctx, message) => ctx.send(message.text),
        })),
    });
    let asked = 0;
    const credentials = () => {
      asked += 1;
      if (asked > 1) throw new Error("The session has expired");
      return {};
    };
    const ch = instrumentWSChannel(
      executeWSChannel(served.url, "api.live.room", { room: "r1" }, { backoff: FAST, credentials }),
      { ...META, transport: "ws" },
    );
    closers.push(() => ch.close());
    await new Promise<void>((resolve) => ch.on("data", () => resolve()));

    for (const connection of served.handler.connections.list()) {
      served.handler.connections.disconnect(connection.connectionId, 1012, "Service restart");
    }
    await expect.poll(() => reconnects().length, { timeout: 4_000 }).toBeGreaterThanOrEqual(2);

    expect(reconnects().slice(0, 2)).toEqual([
      expect.objectContaining({ failures: 0, openedBefore: true }),
      expect.objectContaining({ failures: 1, cause: { message: "The session has expired" } }),
    ]);
  });

  it("says how the socket closed, and that it had opened, when the server lets it go", async () => {
    served = await serveWS({
      room: channel
        .variables(z.object({ room: z.string() }))
        .send(z.object({ text: z.string() }))
        .response<string>()
        .implement(() => ({
          onJoin: (ctx) => ctx.send("welcome"),
          onMessage: (ctx, message) => ctx.send(message.text),
        })),
    });
    const ch = instrumentWSChannel(
      executeWSChannel(
        served.url,
        "api.live.room",
        { room: "r1" },
        { backoff: { initialMs: 5_000 } },
      ),
      { ...META, transport: "ws" },
    );
    closers.push(() => ch.close());
    const welcomed = new Promise<void>((resolve) => ch.on("data", () => resolve()));
    await welcomed;

    for (const connection of served.handler.connections.list()) {
      served.handler.connections.disconnect(connection.connectionId, 1012, "Service restart");
    }
    await expect.poll(() => reconnects().length, { timeout: 4_000 }).toBe(1);

    expect(reconnects()[0]).toMatchObject({
      openedBefore: true,
      failures: 0,
      cause: { message: "The socket closed with code 1012: Service restart" },
    });
  });
});

describe("a stream the proxy relays", () => {
  it("tells how its upstream connection stands, under the id the stream opened with", async () => {
    const upstream = `http://127.0.0.1:${await closedPort()}/v1`;
    const api = defineApi({
      expose: true,
      name: "wiki",
      baseURL: upstream,
      groups: {
        live: defineGroup({
          prefix: "feed",
          endpoints: { room: stream.response<unknown>().get("r1") },
        }),
      },
    });
    const handler = createHandler({ sources: { wiki: api } });
    const port = await listen(
      createServer(async (req, res) => {
        await sendWebResponse(await handler.handle(toWebRequest(req, res)), res);
      }),
    );
    const controller = new AbortController();
    closers.push(() => controller.abort());
    const query = new URLSearchParams({ _s: "wiki", _g: "live", _m: "room" });

    /* The proxy holds its answer's headers back until the first event, which never comes. */
    void fetch(`http://127.0.0.1:${port}/api/sse?${query}`, {
      headers: { Accept: "text/event-stream" },
      signal: controller.signal,
    }).catch(() => undefined);
    await expect.poll(() => reconnects().length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);

    const opened = vi.mocked(studioHooks.onStreamOpen)?.mock.calls[0]?.[0];
    expect(opened).toMatchObject({ mode: "proxy" });
    expect(statuses[0]).toMatchObject({ requestId: opened?.requestId, status: "connecting" });
    expect(reconnects()[0]).toMatchObject({
      requestId: opened?.requestId,
      failures: 1,
      cause: { code: "ECONNREFUSED" },
    });
  });
});
