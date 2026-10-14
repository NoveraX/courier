/**
 * A group's transport and a call's: each of `fetch`, `webSocket` and
 * `dispatcher` is taken from the call that sets it, else from the nearest
 * group that does, else from the source. They reach the calls, the streams
 * and the channels a direct caller opens, and the streams and channels the
 * proxy relays; sockets that carry different transports are never shared;
 * and one that cannot send is refused where it is given.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocketServer } from "ws";
import { createWSHandler } from "../src/adapter/handle-ws";
import { relayStream } from "../src/adapter/sse-relay";
import { createCaller } from "../src/caller";
import { defineApi } from "../src/define/api";
import { courier } from "../src/define/courier";
import { defineGroup } from "../src/define/group";
import { routesOf } from "../src/define/routes-of";
import type {
  PlatformFetch,
  SourceDispatcher,
  SourceSocketOptions,
} from "../src/http-client/source-transport";
import { attachWebSocketUpgrade, type UpgradeServer } from "../src/node";
import { createProxyCaller } from "../src/proxy-caller";
import { clearWSConnectionPool } from "../src/realtime/caller-ws";

const { endpoint, stream, channel } = courier();

/* Stand in for undici's: Courier hands them on and never calls them. */
const apiAgent: SourceDispatcher = { dispatch: () => true };
const groupAgent: SourceDispatcher = { dispatch: () => true };
const innerAgent: SourceDispatcher = { dispatch: () => true };
const callAgent: SourceDispatcher = { dispatch: () => true };

const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  clearWSConnectionPool();
  for (const close of closers.splice(0).reverse()) await close();
});

function recording() {
  const sent: Array<{ url: string; init: RequestInit }> = [];
  const send: PlatformFetch = async (url, init) => {
    sent.push({ url, init });
    return url.endsWith("/ticks")
      ? new Response("data: 1\n\nevent: courier:complete\ndata: null\n\n", {
          headers: { "content-type": "text/event-stream" },
        })
      : Response.json({ ok: true });
  };
  return { sent, send };
}

/* An API that sends with `send` through `apiAgent`, and its groups. */
function payments(send: PlatformFetch, groupFetch?: PlatformFetch) {
  return defineApi({
    expose: true,
    name: "payments",
    baseURL: "https://bank.example/v1",
    fetch: send,
    dispatcher: apiAgent,
    groups: {
      settlement: defineGroup({
        prefix: "settlement",
        dispatcher: groupAgent,
        ...(groupFetch && { fetch: groupFetch }),
        endpoints: { pay: endpoint.post("pay"), ticks: stream.response<number>().get("ticks") },
        groups: {
          refunds: defineGroup({ prefix: "refunds", endpoints: { list: endpoint.get("list") } }),
          disputes: defineGroup({
            prefix: "disputes",
            dispatcher: innerAgent,
            endpoints: { list: endpoint.get("list") },
          }),
        },
      }),
      catalog: defineGroup({ prefix: "catalog", endpoints: { list: endpoint.get("list") } }),
    },
  });
}

describe("a group's transport", () => {
  it("sends the group's calls, and those of the groups inside it, through the nearest dispatcher", async () => {
    const { sent, send } = recording();
    const client = createCaller(payments(send));

    await client.settlement.pay();
    await client.settlement.refunds.list();
    await client.settlement.disputes.list();
    await client.catalog.list();

    expect(sent.map(({ url, init }) => [url, Reflect.get(init, "dispatcher")])).toEqual([
      ["https://bank.example/v1/settlement/pay", groupAgent],
      ["https://bank.example/v1/settlement/refunds/list", groupAgent],
      ["https://bank.example/v1/settlement/disputes/list", innerAgent],
      ["https://bank.example/v1/catalog/list", apiAgent],
    ]);
  });

  it("sends the group's calls and opens its streams with the group's own fetch", async () => {
    const api = recording();
    const group = recording();
    const client = createCaller(payments(api.send, group.send));

    await client.settlement.pay();
    for await (const _ of client.settlement.ticks());
    await client.catalog.list();

    expect(group.sent.map(({ url }) => url)).toEqual([
      "https://bank.example/v1/settlement/pay",
      "https://bank.example/v1/settlement/ticks",
    ]);
    expect(group.sent.map(({ init }) => Reflect.get(init, "dispatcher"))).toEqual([
      groupAgent,
      groupAgent,
    ]);
    expect(api.sent.map(({ url }) => url)).toEqual(["https://bank.example/v1/catalog/list"]);
  });

  it("opens the group's streams with its dispatcher, as a request that stays open is given it", async () => {
    const { sent, send } = recording();

    for await (const _ of createCaller(payments(send)).settlement.ticks());

    expect(sent[0]?.init).toMatchObject({ dispatcher: groupAgent });
  });

  it("is what the proxy relays the group's streams with", async () => {
    const { sent, send } = recording();
    const relay = relayStream(payments(send), "settlement", "ticks");

    const relayed: unknown[] = [];
    for await (const event of relay({
      variables: undefined,
      headers: {},
      signal: new AbortController().signal,
    } as never))
      relayed.push(event);

    expect(sent.map(({ url, init }) => [url, Reflect.get(init, "dispatcher")])).toEqual([
      ["https://bank.example/v1/settlement/ticks", groupAgent],
    ]);
  });
});

describe("a call's transport", () => {
  it("sends that call alone through its dispatcher, over its group's and its API's", async () => {
    const { sent, send } = recording();
    const client = createCaller(payments(send));

    await client.settlement.with({ dispatcher: callAgent }).pay();
    await client.catalog.with({ dispatcher: callAgent }).list();
    await client.settlement.pay();

    expect(sent.map(({ init }) => Reflect.get(init, "dispatcher"))).toEqual([
      callAgent,
      callAgent,
      groupAgent,
    ]);
  });

  it("sends that call with its own fetch, and opens a stream with its dispatcher", async () => {
    const api = recording();
    const own = recording();
    const client = createCaller(payments(api.send));

    await client.catalog.with({ fetch: own.send }).list();
    for await (const _ of client.settlement.with({ dispatcher: callAgent }).ticks());

    expect(own.sent.map(({ url }) => url)).toEqual(["https://bank.example/v1/catalog/list"]);
    expect(api.sent.map(({ url, init }) => [url, Reflect.get(init, "dispatcher")])).toEqual([
      ["https://bank.example/v1/settlement/ticks", callAgent],
    ]);
  });

  it("is refused, through the proxy, before anything is sent", async () => {
    const client = createProxyCaller(routesOf(payments(recording().send), "payments"), {
      proxyPath: { http: "http://127.0.0.1:1/api/request" },
    });

    await expect(client.catalog.with({ dispatcher: callAgent }).list()).rejects.toMatchObject({
      name: "ConfigurationError",
      code: "PROXY_OPTION_NOT_ALLOWED",
      message: expect.stringContaining("`dispatcher` cannot be set on a call through the proxy"),
    });
  });
});

describe("a call's transport through the proxy", () => {
  it("is refused on a stream and on a channel before either opens", () => {
    const live = defineApi({
      expose: true,
      name: "live",
      baseURL: "https://bank.example",
      endpoints: {
        ticks: stream.response<number>().get("ticks"),
        room: channel.send<string>().response<string>().connect("room"),
      },
    });
    const client = createProxyCaller(routesOf(live, "live"), {
      proxyPath: { sse: "http://127.0.0.1:1/api/sse", ws: "ws://127.0.0.1:1/api/ws" },
    });
    const refused = expect.objectContaining({ code: "PROXY_OPTION_NOT_ALLOWED" });

    expect(() => client.with({ dispatcher: callAgent }).ticks()).toThrow(refused);
    expect(() => client.with({ dispatcher: callAgent }).room()).toThrow(refused);
  });
});

describe("a transport that cannot send", () => {
  it("is refused where a group is defined, naming the group", () => {
    const define = () =>
      defineGroup({ prefix: "settlement", dispatcher: {} as never, endpoints: {} });

    expect(define).toThrow(
      expect.objectContaining({
        code: "SOURCE_TRANSPORT_INVALID",
        message:
          "[courier] A group's dispatcher must be an undici Dispatcher — an Agent, a ProxyAgent — with its dispatch method; it is object.",
      }),
    );
  });

  it("is refused where a source is defined, a dispatcher with no dispatch method", () => {
    const define = () =>
      defineApi({
        expose: true,
        name: "bank",
        baseURL: "https://bank.example",
        dispatcher: "agent",
        endpoints: {},
      } as never);

    expect(define).toThrow(expect.objectContaining({ code: "SOURCE_TRANSPORT_INVALID" }));
  });

  it("refuses the stream it is given to where it is opened, naming the call", () => {
    const { send } = recording();

    expect(() =>
      createCaller(payments(send))
        .settlement.with({ dispatcher: {} as never })
        .ticks(),
    ).toThrow(expect.objectContaining({ code: "SOURCE_TRANSPORT_INVALID" }));
  });

  it("fails the call it is given to, naming the call", async () => {
    const { send } = recording();

    await expect(
      createCaller(payments(send))
        .catalog.with({ fetch: "undici" as never })
        .list(),
    ).rejects.toMatchObject({
      code: "SOURCE_TRANSPORT_INVALID",
      message: "[courier] A call's fetch must be a function; it is string.",
    });
  });
});

describe("a group's sockets", () => {
  /** A Courier server that serves `api.desk.room` and `api.lobby.room` on every path. */
  async function serveRooms(): Promise<string> {
    const room = () =>
      channel
        .send<string>()
        .response<string>()
        .implement(() => ({ onMessage: () => undefined }));
    const served = defineApi({
      expose: true,
      name: "api",
      groups: {
        desk: defineGroup({ prefix: "desk", endpoints: { room: room() } }),
        lobby: defineGroup({ prefix: "lobby", endpoints: { room: room() } }),
      },
    });
    const handler = createWSHandler({ sources: { api: served } });
    const server: Server = createServer();
    attachWebSocketUpgrade(server, {
      path: undefined,
      createServer: (options) => new WebSocketServer(options) as unknown as UpgradeServer,
      onSocket: (socket, request) => handler.handleSocket(socket, request),
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    closers.push(async () => {
      await handler.destroy();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  it("open with the group's class and dispatcher, never shared with another group's", async () => {
    const baseURL = await serveRooms();
    const opened: Array<{ by: string; options: SourceSocketOptions }> = [];
    const socketClass = (by: string) =>
      class RecordingWebSocket extends WebSocket {
        constructor(url: string, options: SourceSocketOptions) {
          opened.push({ by, options });
          super(url, options.protocols);
        }
      };
    const room = () => channel.send<string>().response<string>().connect("room");
    const api = defineApi({
      expose: true,
      name: "api",
      baseURL,
      webSocket: socketClass("api"),
      dispatcher: apiAgent,
      groups: {
        desk: defineGroup({
          prefix: "desk",
          webSocket: socketClass("desk"),
          dispatcher: groupAgent,
          endpoints: { room: room() },
        }),
        lobby: defineGroup({ prefix: "lobby", endpoints: { room: room() } }),
      },
    });
    const client = createCaller(api);

    const rooms = [
      client.desk.room(),
      client.desk.room(),
      client.lobby.room(),
      client.lobby.with({ dispatcher: callAgent }).room(),
    ];
    await vi.waitFor(() => expect(rooms.map((r) => r.status)).toEqual(Array(4).fill("connected")));

    expect(opened).toEqual([
      { by: "desk", options: { dispatcher: groupAgent } },
      { by: "api", options: { dispatcher: apiAgent } },
      { by: "api", options: { dispatcher: callAgent } },
    ]);
    for (const r of rooms) r.close();
  });

  it("are what the proxy relays the group's channels through", async () => {
    const upstream = await serveRooms();
    const opened: Array<{ url: string; options: SourceSocketOptions }> = [];
    class RecordingWebSocket extends WebSocket {
      constructor(url: string, options: SourceSocketOptions) {
        opened.push({ url, options });
        super(url, options.protocols);
      }
    }
    const room = () => channel.send<string>().response<string>().connect("room");
    const api = defineApi({
      expose: true,
      name: "api",
      baseURL: upstream,
      groups: {
        desk: defineGroup({
          prefix: "desk",
          webSocket: RecordingWebSocket,
          dispatcher: groupAgent,
          endpoints: { room: room() },
        }),
        lobby: defineGroup({ prefix: "lobby", endpoints: { room: room() } }),
      },
    });
    const proxy = createWSHandler({ sources: { api } });
    const server: Server = createServer();
    attachWebSocketUpgrade(server, {
      path: "/api/ws",
      createServer: (options) => new WebSocketServer(options) as unknown as UpgradeServer,
      onSocket: (socket, request) => proxy.handleSocket(socket, request),
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    closers.push(async () => {
      await proxy.destroy();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });
    const port = (server.address() as AddressInfo).port;
    const caller = createProxyCaller(routesOf(api, "api"), {
      proxyPath: { ws: `ws://127.0.0.1:${port}/api/ws` },
    });

    const desk = caller.desk.room();
    const lobby = caller.lobby.room();
    await vi.waitFor(() => expect([desk.status, lobby.status]).toEqual(["connected", "connected"]));
    await vi.waitFor(() => expect(opened).toHaveLength(1));

    expect(opened[0]?.options).toMatchObject({ dispatcher: groupAgent });
    expect(opened[0]?.url.startsWith(upstream.replace("http", "ws"))).toBe(true);
    desk.close();
    lobby.close();
  });
});
