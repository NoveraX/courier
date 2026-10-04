/**
 * A caller's `ws` options reach the socket its channels share, end to end on
 * a real `ws` server.
 *
 * `getAuthToken`, the backoff, the heartbeat and the queue limits are
 * options of the connection, passed through the caller: without them a
 * server's `auth_required` would go unanswered — "no getAuthToken
 * configured" — and the connection close, however the application means to
 * refresh.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";

import { createWSHandler } from "../src/adapter/handle-ws";
import { sendAuthRequired } from "../src/adapter/ws-token-refresh";
import type { WSHandler } from "../src/adapter/ws-types";
import { createCaller } from "../src/caller";
import { defineApi } from "../src/define/api";
import { courier } from "../src/define/courier";
import { defineGroup } from "../src/define/group";
import { attachWebSocketUpgrade, type UpgradeServer } from "../src/node";
import { createProxyCaller } from "../src/proxy-caller";
import { clearWSConnectionPool } from "../src/realtime/caller-ws";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { settle } from "./helpers/ws-server";

const { channel } = courier();

const served = defineApi({
  name: "api",
  baseURL: "http://127.0.0.1:1",
  groups: {
    live: defineGroup({
      prefix: "live",
      endpoints: {
        room: channel
          .send<string>()
          .response<string>()
          .implement(() => ({ onMessage: () => undefined })),
      },
    }),
  },
});

let server: Server | undefined;
let handler: WSHandler | undefined;

afterEach(async () => {
  clearWSConnectionPool();
  _resetSourcesForTests();
  await handler?.destroy();
  handler = undefined;
  server?.closeAllConnections();
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
  server = undefined;
});

/** Serve `api.live.room` on every path, refreshing tokens into the connection's meta. */
async function serve(): Promise<string> {
  registerSources({ api: served } as never);
  handler = createWSHandler({ onTokenRefresh: ({ token }) => ({ token }) });
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

/** Ask the one open connection for a token, and read what it holds once the deadline passed. */
async function refreshRoundTrip(): Promise<{ meta: unknown; connections: number }> {
  const connections = handler?.connections;
  const [connection] = connections?.list() ?? [];
  if (!connections || !connection) throw new Error("no connection was opened");
  sendAuthRequired(connections, connection.connectionId, 150);
  await settle(300);
  return { meta: connections.get(connection.connectionId)?.meta, connections: connections.count };
}

describe("a proxy caller's ws options", () => {
  it("answer the server's auth_required with a token from getAuthToken", async () => {
    const host = await serve();
    let issued = 0;
    const client = createProxyCaller<typeof served>("api", {
      source: served,
      proxyPath: { ws: `ws://${host}/api/ws` },
      ws: { getAuthToken: () => `token-${++issued}` },
    });
    const room = client.live.room();
    await settle(80);

    const after = await refreshRoundTrip();

    expect(after).toEqual({ meta: { token: "token-2" }, connections: 1 });
    expect(room.status).toBe("connected");
    room.close();
  });

  it("open a socket of their own beside a caller with other options", async () => {
    const host = await serve();
    const proxyPath = { ws: `ws://${host}/api/ws` };
    const plain = createProxyCaller<typeof served>("api", { source: served, proxyPath });
    const tuned = createProxyCaller<typeof served>("api", {
      source: served,
      proxyPath,
      ws: { backoff: { initialMs: 50 } },
    });

    const first = plain.live.room();
    const second = plain.live.room();
    const third = tuned.live.room();
    await settle(80);

    expect(handler?.connections.count).toBe(2);
    for (const room of [first, second, third]) room.close();
  });
});

describe("a direct caller's ws options", () => {
  it("answer the server's auth_required with a token from getAuthToken", async () => {
    const host = await serve();
    const remote = defineApi({
      name: "api",
      baseURL: `http://${host}`,
      groups: {
        live: defineGroup({
          prefix: "live",
          endpoints: { room: channel.send<string>().response<string>().connect("room") },
        }),
      },
    });
    const client = createCaller(remote, { ws: { getAuthToken: () => "direct-token" } });
    const room = client.live.room();
    await settle(80);

    const after = await refreshRoundTrip();

    expect(after).toEqual({ meta: { token: "direct-token" }, connections: 1 });
    room.close();
  });

  it("are the socket's options, not a connection's own", () => {
    const typeChecks = () =>
      createCaller(served, {
        // @ts-expect-error — the URL is the endpoint's to say
        ws: { url: "wss://elsewhere.example" },
      });

    expect(typeChecks).toBeTypeOf("function");
  });
});
