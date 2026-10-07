/**
 * A channel of an API that keeps a session, relayed by the proxy: the
 * upstream socket is opened with the user's session — the cookies it names,
 * the bearer — the API's headers and what `allowedHeaders` lets through, as
 * a relayed stream is, and two users' subscriptions never share one.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocketServer } from "ws";

import { createWSHandler } from "../../src/adapter/handle-ws";
import type { WSHandler } from "../../src/adapter/ws-types";
import { defineApi } from "../../src/define/api";
import { courier } from "../../src/define/courier";
import { defineGroup } from "../../src/define/group";
import { attachWebSocketUpgrade, type UpgradeServer } from "../../src/node";
import { clearWSConnectionPool } from "../../src/realtime/caller-ws";
import type { WSCredentials } from "../../src/realtime/ws/ws-credentials";
import { executeWSChannel } from "../../src/realtime/ws-channel-client";
import { _resetSourcesForTests, registerSources } from "../../src/sources";

const { channel } = courier();

interface Admitted {
  cookie: string | null;
  authorization: string | null;
  apiKey: string | null;
  tenant: string | null;
}

const closers: Array<() => Promise<void>> = [];
let upstream: WSHandler | undefined;
let admitted: Admitted[] = [];

afterEach(async () => {
  clearWSConnectionPool();
  _resetSourcesForTests();
  for (const close of closers.splice(0).reverse()) await close();
  upstream = undefined;
  admitted = [];
});

async function listen(handler: WSHandler): Promise<string> {
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
  return `127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/* The upstream: a Courier server for `api.live.room`, keeping what each connection opened with. */
async function serveUpstream(): Promise<string> {
  registerSources({
    api: defineApi({
      name: "api",
      baseURL: "http://127.0.0.1:1",
      groups: {
        live: defineGroup({
          prefix: "live",
          endpoints: {
            room: channel
              .variables<{ name: string }>()
              .send<string>()
              .response<string>()
              .implement(() => ({ onJoin: (ctx) => ctx.send("hi"), onMessage() {} })),
          },
        }),
      },
    }),
  } as never);
  upstream = createWSHandler({
    onConnect: ({ request }) => {
      const read = (name: string) => request.headers.get(name);
      admitted.push({
        cookie: read("cookie"),
        authorization: read("authorization"),
        apiKey: read("x-api-key"),
        tenant: read("x-tenant"),
      });
      return {};
    },
  });
  return listen(upstream);
}

/* The proxy: the same channel, relayed to the upstream, of an API that keeps a session. */
async function serveProxy(upstreamHost: string): Promise<string> {
  const api = defineApi({
    name: "api",
    baseURL: `http://${upstreamHost}`,
    headers: { "x-api-key": "k1" },
    allowedHeaders: ["x-tenant"],
    session: { cookies: ["sid"], bearer: "access_token" },
    groups: {
      live: defineGroup({
        prefix: "live",
        endpoints: {
          room: channel
            .variables<{ name: string }>()
            .send<string>()
            .response<string>()
            .connect("room"),
        },
      }),
    },
  });
  return listen(createWSHandler({ sources: { api } }));
}

/* A client of the proxy: what a browser's socket would carry, on Node's handshake. */
async function subscribe(proxyHost: string, name: string, credentials: () => WSCredentials) {
  const ch = executeWSChannel<string, string>(
    `ws://${proxyHost}/api/ws`,
    "api.live.room",
    { name },
    { credentials },
  );
  const heard: string[] = [];
  ch.on("data", (data) => heard.push(data));
  await vi.waitFor(() => expect(heard).toEqual(["hi"]));
  return ch;
}

describe("a relayed channel of an API that keeps a session", () => {
  it("is opened upstream with the user's session and the API's headers, nothing else of theirs", async () => {
    const proxy = await serveProxy(await serveUpstream());

    const ch = await subscribe(proxy, "lobby", () => ({
      handshake: { cookie: "sid=ada; access_token=t1; theme=dark" },
    }));

    expect(admitted).toEqual([
      { cookie: "sid=ada", authorization: "Bearer t1", apiKey: "k1", tenant: null },
    ]);
    ch.close();
  });

  it("shares an upstream socket between one user's subscriptions, never between two users'", async () => {
    const proxy = await serveProxy(await serveUpstream());
    const ada = () => ({ handshake: { cookie: "sid=ada" } });

    const first = await subscribe(proxy, "lobby", ada);
    const second = await subscribe(proxy, "kitchen", ada);
    const grace = await subscribe(proxy, "lobby", () => ({ handshake: { cookie: "sid=grace" } }));

    expect(admitted.map((a) => a.cookie)).toEqual(["sid=ada", "sid=grace"]);
    expect(upstream?.connections.count).toBe(2);
    for (const ch of [first, second, grace]) ch.close();
  });

  it("carries upstream a header the client sent in its frame, where allowedHeaders lets it", async () => {
    const proxy = await serveProxy(await serveUpstream());

    const ch = await subscribe(proxy, "lobby", () => ({
      frame: { headers: { "x-tenant": "acme", "x-internal": "no" } },
    }));

    expect(admitted).toEqual([{ cookie: null, authorization: null, apiKey: "k1", tenant: "acme" }]);
    ch.close();
  });
});
