/**
 * A proxy relays a stream or a channel another server serves: a browser
 * reaches a third party's stream through its own server, which opens it with
 * the source's credentials.
 */
import {
  createServer,
  type IncomingHttpHeaders,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocketServer } from "ws";
import { z } from "zod";

import { createHandler } from "../src/adapter";
import { createWSHandler } from "../src/adapter/handle-ws";
import type { WSHandler, WSHandlerConfig } from "../src/adapter/ws-types";
import { courier, defineApi, defineGroup } from "../src/define";
import { routesOf } from "../src/define/routes-of";
import {
  attachWebSocketUpgrade,
  sendWebResponse,
  toWebRequest,
  type UpgradeServer,
} from "../src/node";
import { createProxyCaller } from "../src/proxy-caller";
import { clearWSConnectionPool } from "../src/realtime/caller-ws";
import type { RealtimeError } from "../src/realtime/errors";
import { studioHooks } from "../src/studio";
import type { StreamStatusEvent } from "../src/studio/hooks-stream";
import { refusedSocketCause } from "./helpers/refused-socket-cause";

const { stream, channel } = courier();
const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  clearWSConnectionPool();
  for (const close of closers.splice(0).reverse()) await close();
});

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  closers.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return `http://127.0.0.1:${port}`;
}

interface Seen {
  url: string;
  headers: IncomingHttpHeaders;
  closed: boolean;
}

/** A third party's event stream: two events, then it stays open. */
async function thirdParty(): Promise<{ origin: string; seen: Seen[] }> {
  const seen: Seen[] = [];
  const server = createServer((req, res: ServerResponse) => {
    const entry: Seen = { url: req.url ?? "", headers: req.headers, closed: false };
    seen.push(entry);
    req.on("close", () => {
      entry.closed = true;
    });
    if (req.url?.startsWith("/v1/feed/secret")) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end('{"error":"no key"}');
      return;
    }
    if (req.url?.startsWith("/v1/feed/moved")) {
      res.writeHead(307, { location: "/v1/feed/r1" });
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write('id: 7\nevent: tick\ndata: {"n":1}\n\n');
    res.write("data: plain text\n\n");
  });
  return { origin: await listen(server), seen };
}

function wikiApi(origin: string) {
  return defineApi({
    expose: true,
    name: "wiki",
    baseURL: `${origin}/v1`,
    headers: { Authorization: "Bearer k1" },
    groups: {
      live: defineGroup({
        prefix: "feed",
        endpoints: {
          room: stream
            .variables<{ room: string; since?: string }>()
            .response<unknown>()
            .get(":room"),
        },
      }),
    },
  });
}

/* The stream's source holding a key in a header of its own, which `fetch` keeps across origins. */
function keyedApi(origin: string, redirect?: RequestRedirect) {
  return defineApi({
    expose: true,
    name: "wiki",
    baseURL: `${origin}/v1`,
    headers: { Authorization: "Bearer k1", "x-service-key": "k-123" },
    ...(redirect && { redirect }),
    groups: {
      live: defineGroup({
        prefix: "feed",
        endpoints: { room: stream.variables<{ room: string }>().response<unknown>().get(":room") },
      }),
    },
  });
}

/* `deaf`: the host hands over a request whose signal never fires, as one let go of and collected does. */
async function proxyOf(sources: Record<string, object>, { deaf = false } = {}): Promise<string> {
  const handler = createHandler({ sources });
  const server = createServer(async (req, res) => {
    const request = deaf ? toWebRequest(req) : toWebRequest(req, res);
    await sendWebResponse(await handler.handle(request), res);
  });
  return listen(server);
}

describe("a stream another server serves, through the proxy", () => {
  it("is opened with the source's headers and relayed event by event, ids and names kept", async () => {
    const upstream = await thirdParty();
    const api = wikiApi(upstream.origin);
    const proxy = await proxyOf({ wiki: api });
    const caller = createProxyCaller(routesOf(api, "wiki"), {
      proxyPath: { sse: `${proxy}/api/sse` },
    });

    const subscription = await caller.live.room({ room: "r1", since: "2026" });
    const events: unknown[] = [];
    for await (const event of subscription) {
      events.push(event);
      if (events.length === 2) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(events).toEqual([
      expect.objectContaining({ id: "7", event: "tick", data: { n: 1 } }),
      expect.objectContaining({ data: "plain text" }),
    ]);
    expect(upstream.seen[0]?.url).toBe("/v1/feed/r1?since=2026");
    expect(upstream.seen[0]?.headers.authorization).toBe("Bearer k1");
    expect(upstream.seen[0]?.closed).toBe(true);
  });

  it("closes the upstream when its client leaves, though the request never says so", async () => {
    const upstream = await thirdParty();
    const api = wikiApi(upstream.origin);
    const proxy = await proxyOf({ wiki: api }, { deaf: true });
    const caller = createProxyCaller(routesOf(api, "wiki"), {
      proxyPath: { sse: `${proxy}/api/sse` },
    });

    const subscription = await caller.live.room({ room: "r1" });
    for await (const _event of subscription) break;

    await expect.poll(() => upstream.seen[0]?.closed, { timeout: 2000 }).toBe(true);
  });

  it("resumes the upstream from the id the client resumes from", async () => {
    const upstream = await thirdParty();
    const proxy = await proxyOf({ wiki: wikiApi(upstream.origin) });
    const query = new URLSearchParams({ _s: "wiki", _g: "live", _m: "room", _v: '{"room":"r1"}' });
    const controller = new AbortController();

    const response = await fetch(`${proxy}/api/sse?${query}`, {
      headers: { Accept: "text/event-stream", "Last-Event-ID": "7" },
      signal: controller.signal,
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    controller.abort();

    expect(response.status).toBe(200);
    expect(upstream.seen[0]?.headers["last-event-id"]).toBe("7");
  });

  it("fails as the upstream refuses it", async () => {
    const upstream = await thirdParty();
    const api = wikiApi(upstream.origin);
    const proxy = await proxyOf({ wiki: api });
    const caller = createProxyCaller(routesOf(api, "wiki"), {
      proxyPath: { sse: `${proxy}/api/sse` },
    });

    const failure = await (async () => {
      for await (const _event of await caller.live.room({ room: "secret" })) void _event;
    })().catch((error: RealtimeError) => error);

    expect(failure).toMatchObject({ code: 4401 });
  });

  it("follows an upstream redirect on the upstream's own origin, with the source's headers", async () => {
    const upstream = await thirdParty();
    const api = wikiApi(upstream.origin);
    const proxy = await proxyOf({ wiki: api });
    const caller = createProxyCaller(routesOf(api, "wiki"), {
      proxyPath: { sse: `${proxy}/api/sse` },
    });

    const subscription = await caller.live.room({ room: "moved" });
    let first: unknown;
    for await (const event of subscription) {
      first = event;
      break;
    }

    expect(first).toEqual(expect.objectContaining({ id: "7", data: { n: 1 } }));
    expect(upstream.seen.map((seen) => seen.url)).toEqual(["/v1/feed/moved", "/v1/feed/r1"]);
    expect(upstream.seen[1]?.headers.authorization).toBe("Bearer k1");
  });

  it("follows no upstream redirect to another origin, so the source's keys never reach it", async () => {
    const foreign = await thirdParty();
    const upstream = createServer((_req, res) => {
      res.writeHead(302, { location: `${foreign.origin}/v1/feed/r1` });
      res.end();
    });
    const api = keyedApi(await listen(upstream));
    const proxy = await proxyOf({ wiki: api });
    const caller = createProxyCaller(routesOf(api, "wiki"), {
      proxyPath: { sse: `${proxy}/api/sse` },
    });

    /* Followed, the relay would stream the other host's events for good. */
    const outcome = await Promise.race([
      (async () => {
        for await (const _event of await caller.live.room({ room: "r1" })) void _event;
        return "ended";
      })().catch((error: RealtimeError) => error),
      new Promise((resolve) => setTimeout(() => resolve("still streaming"), 2000)),
    ]);

    expect(outcome).toMatchObject({ code: 4302 });
    expect(foreign.seen).toEqual([]);
  });

  it("follows a redirect to another origin when the source names `redirect: follow` itself", async () => {
    const foreign = await thirdParty();
    const upstream = createServer((_req, res) => {
      res.writeHead(302, { location: `${foreign.origin}/v1/feed/r1` });
      res.end();
    });
    const api = keyedApi(await listen(upstream), "follow");
    const proxy = await proxyOf({ wiki: api });
    const caller = createProxyCaller(routesOf(api, "wiki"), {
      proxyPath: { sse: `${proxy}/api/sse` },
    });

    const subscription = await caller.live.room({ room: "r1" });
    for await (const _event of subscription) break;

    expect(foreign.seen.map((seen) => seen.url)).toEqual(["/v1/feed/r1"]);
  });

  it("refuses a path parameter that would reach another route", async () => {
    const upstream = await thirdParty();
    const proxy = await proxyOf({ wiki: wikiApi(upstream.origin) });
    const query = new URLSearchParams({ _s: "wiki", _g: "live", _m: "room", _v: '{"room":".."}' });

    const response = await fetch(`${proxy}/api/sse?${query}`, {
      headers: { Accept: "text/event-stream" },
    });
    const body = await response.text();

    expect(body).toContain("would change the route");
    expect(upstream.seen).toEqual([]);
  });
});

const Line = z.object({ text: z.string() });

/** A Courier server that serves the channel itself, at `/live/ws`. */
async function channelServer(config?: WSHandlerConfig): Promise<string> {
  const served = defineApi({
    expose: true,
    name: "chat",
    groups: {
      live: defineGroup({
        prefix: "live",
        endpoints: {
          room: channel
            .variables(z.object({ room: z.string() }))
            .send(Line)
            .response<{ text: string }>()
            .implement((v) => ({
              onJoin(ctx) {
                ctx.send({ text: `welcome to ${v.room}` });
              },
              onMessage(ctx, message) {
                if (message.text === "bye") return ctx.close(4000, "Room closed");
                ctx.send({ text: `echo ${message.text}` });
              },
            })),
        },
      }),
    },
  });
  return serveChannels({ chat: served }, "/live/ws", config);
}

async function serveChannels(
  sources: Record<string, object>,
  path: string,
  config?: WSHandlerConfig,
): Promise<string> {
  const handler: WSHandler = createWSHandler({ ...config, sources });
  const server = createServer();
  attachWebSocketUpgrade(server, {
    path,
    createServer: (options) => new WebSocketServer(options) as unknown as UpgradeServer,
    onSocket: (socket, request) => handler.handleSocket(socket, request),
  });
  closers.push(() => handler.destroy());
  return listen(server);
}

function relayedChat(upstreamOrigin: string) {
  return defineApi({
    expose: true,
    name: "chat",
    baseURL: upstreamOrigin,
    groups: {
      live: defineGroup({
        prefix: "live",
        endpoints: {
          room: channel
            .variables(z.object({ room: z.string() }))
            .send(Line)
            .response<{ text: string }>()
            .connect("ws"),
        },
      }),
    },
  });
}

describe("a channel another server serves, through the proxy", () => {
  it("is relayed both ways", async () => {
    const api = relayedChat(await channelServer());
    const proxy = await serveChannels({ chat: api }, "/api/ws");
    const caller = createProxyCaller(routesOf(api, "chat"), {
      proxyPath: { ws: `${proxy.replace("http", "ws")}/api/ws` },
    });
    const room = caller.live.room({ room: "r1" });
    const heard: string[] = [];
    room.on("data", (line) => heard.push(line.text));
    await new Promise((resolve) => setTimeout(resolve, 150));

    room.send({ text: "hi" });
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(heard).toEqual(["welcome to r1", "echo hi"]);
    room.close();
  });

  it("ends the client's subscription as the upstream ends it", async () => {
    const api = relayedChat(await channelServer());
    const proxy = await serveChannels({ chat: api }, "/api/ws");
    const caller = createProxyCaller(routesOf(api, "chat"), {
      proxyPath: { ws: `${proxy.replace("http", "ws")}/api/ws` },
    });
    const room = caller.live.room({ room: "r1" });
    const errors: RealtimeError[] = [];
    room.on("error", (error) => errors.push(error));
    await new Promise((resolve) => setTimeout(resolve, 150));

    room.send({ text: "bye" });
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(errors.map((error) => [error.code, error.message])).toEqual([[4000, "Room closed"]]);
  });

  it("tells Studio how its upstream connection stands, under the subscription's id", async () => {
    const closed = createServer();
    const gone = await listen(closed);
    await new Promise<void>((resolve) => closed.close(() => resolve()));
    const api = relayedChat(gone);
    const proxy = await serveChannels({ chat: api }, "/api/ws");
    const opened: Array<{ requestId: string; mode: string }> = [];
    const told: StreamStatusEvent[] = [];
    studioHooks.onStreamOpen = (event) => opened.push(event);
    studioHooks.onStreamStatus = (event) => told.push(event);
    closers.push(async () => {
      delete studioHooks.onStreamOpen;
      delete studioHooks.onStreamStatus;
    });
    const caller = createProxyCaller(routesOf(api, "chat"), {
      proxyPath: { ws: `${proxy.replace("http", "ws")}/api/ws` },
    });

    const room = caller.live.room({ room: "r1" });
    closers.push(async () => room.close());
    await expect
      .poll(() => told.filter((event) => event.status === "reconnecting").length, {
        timeout: 5_000,
      })
      .toBeGreaterThanOrEqual(1);

    expect(opened[0]).toMatchObject({ mode: "proxy" });
    expect(told[0]).toMatchObject({ requestId: opened[0]?.requestId, status: "connecting" });
    expect(told.find((event) => event.status === "reconnecting")).toMatchObject({
      requestId: opened[0]?.requestId,
      failures: 1,
      cause: await refusedSocketCause(),
    });
  });

  it("ends the client's subscription with why the upstream refused its connection", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const upstream = await channelServer({
      onConnect: () => {
        throw new Error("not today");
      },
    });
    const api = relayedChat(upstream);
    const proxy = await serveChannels({ chat: api }, "/api/ws");
    const caller = createProxyCaller(routesOf(api, "chat"), {
      proxyPath: { ws: `${proxy.replace("http", "ws")}/api/ws` },
    });
    const room = caller.live.room({ room: "r1" });
    const errors: RealtimeError[] = [];
    room.on("error", (error) => errors.push(error));

    /* A channel starts out disconnected: its error is the sign it was refused. */
    await expect
      .poll(() => errors.map((error) => [error.code, error.message]), { timeout: 10_000 })
      .toEqual([[4401, "Connection rejected"]]);
    await expect.poll(() => room.status).toBe("disconnected");
    vi.restoreAllMocks();
  });

  it("tells the client of a message the upstream had no room to take", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const received: string[] = [];
    const slowRoom = defineApi({
      expose: true,
      name: "chat",
      groups: {
        live: defineGroup({
          prefix: "live",
          endpoints: {
            room: channel
              .variables(z.object({ room: z.string() }))
              .send(Line)
              .response<{ text: string }>()
              .implement(() => ({
                async onJoin() {
                  await new Promise((resolve) => setTimeout(resolve, 600));
                },
                onMessage(_ctx, message) {
                  received.push(message.text);
                },
              })),
          },
        }),
      },
    });
    const api = relayedChat(await serveChannels({ chat: slowRoom }, "/live/ws"));
    /* The proxy's own rate limit would refuse the extra messages first. */
    const proxy = await serveChannels({ chat: api }, "/api/ws", { maxMessagesPerSecond: 1_000 });
    const caller = createProxyCaller(routesOf(api, "chat"), {
      proxyPath: { ws: `${proxy.replace("http", "ws")}/api/ws` },
    });
    const room = caller.live.room({ room: "r1" });
    const errors: RealtimeError[] = [];
    room.on("error", (error) => errors.push(error));
    await expect.poll(() => room.status, { timeout: 10_000 }).toBe("connected");

    for (let n = 0; n < 105; n++) room.send({ text: `m${n}` });

    await expect.poll(() => received.length, { timeout: 10_000 }).toBe(100);
    await expect.poll(() => errors.length, { timeout: 10_000 }).toBe(5);
    expect(errors.map((error) => error.code)).toEqual([4429, 4429, 4429, 4429, 4429]);
    room.close();
    vi.restoreAllMocks();
  });

  it("tells the client once of a message too large for the upstream", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const api = relayedChat(await channelServer());
    const proxy = await serveChannels({ chat: api }, "/api/ws", { maxMessageSize: 200_000 });
    const caller = createProxyCaller(routesOf(api, "chat"), {
      proxyPath: { ws: `${proxy.replace("http", "ws")}/api/ws` },
      ws: { maxMessageSize: 200_000 },
    });
    const room = caller.live.room({ room: "r1" });
    const errors: RealtimeError[] = [];
    room.on("error", (error) => errors.push(error));
    await new Promise((resolve) => setTimeout(resolve, 200));

    room.send({ text: "x".repeat(100_000) });
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(errors.map((error) => error.code)).toEqual([4413]);
    room.close();
    vi.restoreAllMocks();
  });
});
