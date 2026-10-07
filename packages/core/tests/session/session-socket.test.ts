/**
 * A channel of an API that keeps a session, opened by a direct caller, end
 * to end on a real server: the socket carries the user's session as a call
 * does — on its handshake where the platform takes headers there, in its
 * first frame from a browser — and two users' channels never share one.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocketServer } from "ws";

import { createWSHandler } from "../../src/adapter/handle-ws";
import type { WSHandler } from "../../src/adapter/ws-types";
import { createCaller } from "../../src/caller";
import { defineApi } from "../../src/define/api";
import { courier } from "../../src/define/courier";
import { defineGroup } from "../../src/define/group";
import { attachWebSocketUpgrade, type UpgradeServer } from "../../src/node";
import { clearWSConnectionPool } from "../../src/realtime/caller-ws";
import type { IncomingRequest } from "../../src/session/incoming-request";
import { registerRequestContext } from "../../src/session/request-context";
import { _resetSourcesForTests, registerSources } from "../../src/sources";

const { channel } = courier();

const room = () =>
  channel
    .variables<{ name: string }>()
    .send<string>()
    .response<string>()
    .implement(() => ({ onJoin: (ctx) => ctx.send("hi"), onMessage() {} }));

interface Admitted {
  cookie: string | null;
  authorization: string | null;
  apiKey: string | null;
}

let server: Server | undefined;
let handler: WSHandler | undefined;
let admitted: Admitted[] = [];
let removeProvider: (() => void) | undefined;

afterEach(async () => {
  removeProvider?.();
  removeProvider = undefined;
  vi.unstubAllGlobals();
  clearWSConnectionPool();
  _resetSourcesForTests();
  await handler?.destroy();
  server?.closeAllConnections();
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
  server = undefined;
  admitted = [];
});

/* A Courier server for `api.live.room`, keeping what each connection was admitted with. */
async function serve(): Promise<string> {
  registerSources({
    api: defineApi({
      name: "api",
      baseURL: "http://127.0.0.1:1",
      groups: { live: defineGroup({ prefix: "live", endpoints: { room: room() } }) },
    }),
  } as never);
  handler = createWSHandler({
    onConnect: ({ request }) => {
      const read = (name: string) => request.headers.get(name);
      admitted.push({
        cookie: read("cookie"),
        authorization: read("authorization"),
        apiKey: read("x-api-key"),
      });
      return {};
    },
  });
  const ws = handler;
  server = createServer();
  attachWebSocketUpgrade(server, {
    path: undefined,
    createServer: (options) => new WebSocketServer(options) as unknown as UpgradeServer,
    onSocket: (socket, request) => ws.handleSocket(socket, request),
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  return `127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function sessionApi(host: string) {
  return defineApi({
    name: "api",
    baseURL: `http://${host}`,
    headers: { "x-api-key": "k1" },
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
}

/* The request the application is serving, with a user's cookies on it. */
function serving(cookie: string): IncomingRequest {
  return { key: {}, method: "GET", headers: new Headers({ cookie }), setCookie: () => true };
}

async function heard(
  open: () => { on(event: "data", handler: (data: string) => void): unknown; close(): void },
) {
  const ch = open();
  const got: string[] = [];
  ch.on("data", (data) => got.push(data));
  await vi.waitFor(() => expect(got).toEqual(["hi"]));
  return ch;
}

describe("a channel a server opens while serving a user", () => {
  it("carries the user's session, the API's headers too, on its handshake", async () => {
    const host = await serve();
    const client = createCaller(sessionApi(host));
    let current: IncomingRequest | undefined = serving("sid=a1; access_token=t1; theme=dark");
    removeProvider = registerRequestContext(() => current);

    const ch = await heard(() => client.live.room({ name: "lobby" }));
    current = undefined;

    expect(admitted).toEqual([{ cookie: "sid=a1", authorization: "Bearer t1", apiKey: "k1" }]);
    ch.close();
  });

  it("opens a socket of its own for each user, and shares one within a request", async () => {
    const host = await serve();
    const client = createCaller(sessionApi(host));
    let current: IncomingRequest | undefined;
    removeProvider = registerRequestContext(() => current);

    current = serving("sid=ada");
    const first = await heard(() => client.live.room({ name: "lobby" }));
    const again = await heard(() => client.live.room({ name: "kitchen" }));
    current = serving("sid=grace");
    const other = await heard(() => client.live.room({ name: "lobby" }));
    current = undefined;

    expect(admitted.map((a) => a.cookie)).toEqual(["sid=ada", "sid=grace"]);
    expect(handler?.connections.count).toBe(2);
    for (const ch of [first, again, other]) ch.close();
  });
});

describe("a channel a browser opens", () => {
  it("sends the readable bearer and the API's headers in its first frame", async () => {
    const host = await serve();
    vi.stubGlobal("document", { cookie: "access_token=t9; theme=dark" });

    const ch = await heard(() => createCaller(sessionApi(host)).live.room({ name: "lobby" }));

    expect(admitted).toEqual([{ cookie: null, authorization: "Bearer t9", apiKey: "k1" }]);
    ch.close();
  });
});

describe("a channel a React Native app opens", () => {
  it("puts the session's headers on its handshake, as React Native's WebSocket takes them", async () => {
    const host = await serve();
    const opened: unknown[][] = [];
    /* Node's WebSocket, as undici takes a handshake's headers: in its options. */
    const NodeSocket = WebSocket as unknown as new (url: string, init: object) => WebSocket;
    vi.stubGlobal("navigator", { product: "ReactNative" });
    vi.stubGlobal(
      "WebSocket",
      class extends NodeSocket {
        constructor(
          url: string,
          protocols?: string[],
          options?: { headers?: Record<string, string> },
        ) {
          opened.push([url, protocols, options]);
          super(url, { ...(protocols && { protocols }), headers: options?.headers ?? {} });
        }
      },
    );

    const ch = await heard(() => createCaller(sessionApi(host)).live.room({ name: "lobby" }));

    expect(opened[0]?.[2]).toEqual({ headers: { "x-api-key": "k1" } });
    expect(admitted).toEqual([{ cookie: null, authorization: null, apiKey: "k1" }]);
    ch.close();
  });
});
