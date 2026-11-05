/**
 * Every kind of subscription a caller returns reads the same, end to end on
 * a real server: a push channel, a channel with `.send()`, through a proxy
 * caller and opened directly — `on("data")` hears the values, the loop
 * yields them, `open` and `close` tell where it stands, and a channel is
 * connected once the server confirmed its subscription.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocketServer } from "ws";

import { createWSHandler } from "../src/adapter/handle-ws";
import type { WSHandler, WSHandlerConfig } from "../src/adapter/ws-types";
import { defineApi } from "../src/define/api";
import { courier } from "../src/define/courier";
import { defineGroup } from "../src/define/group";
import { routesOf } from "../src/define/routes-of";
import { attachWebSocketUpgrade, type UpgradeServer } from "../src/node";
import { createProxyCaller } from "../src/proxy-caller";
import { clearWSConnectionPool } from "../src/realtime/caller-ws";
import { AuthError } from "../src/realtime/errors";
import type { CloseInfo, OpenInfo, Subscription } from "../src/realtime/subscription-types";
import { executeWSChannel } from "../src/realtime/ws-channel-client";
import { executeWSPush } from "../src/realtime/ws-subscription";
import { _resetSourcesForTests, registerSources } from "../src/sources";

const { channel } = courier();

/** The API the server serves: a room the client sends on, and a ticker it only hears. */
function served(onJoin?: () => void | Promise<void>, snapshot?: string) {
  return defineApi({
    expose: true,
    name: "api",
    baseURL: "http://127.0.0.1:1",
    groups: {
      live: defineGroup({
        prefix: "live",
        endpoints: {
          room: channel
            .send<string>()
            .response<string>()
            .implement(() => ({
              async onJoin(ctx) {
                await onJoin?.();
                if (snapshot !== undefined) ctx.send(snapshot);
              },
              onMessage: (ctx, message) => ctx.send(`echo:${message}`),
            })),
          ticker: channel.response<number>().implement(async function* () {
            yield 1;
            yield 2;
          }),
        },
      }),
    },
  });
}

let server: Server | undefined;
let handler: WSHandler | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  clearWSConnectionPool();
  _resetSourcesForTests();
  await handler?.destroy();
  handler = undefined;
  server?.closeAllConnections();
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
  server = undefined;
});

async function serve(
  config: WSHandlerConfig = {},
  options: { onJoin?: () => void | Promise<void>; snapshot?: string } = {},
) {
  const api = served(options.onJoin, options.snapshot);
  registerSources({ api } as never);
  const ws = createWSHandler(config);
  handler = ws;
  server = createServer();
  attachWebSocketUpgrade(server, {
    path: undefined,
    createServer: (o) => new WebSocketServer(o) as unknown as UpgradeServer,
    onSocket: (socket, request) => ws.handleSocket(socket, request),
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const url = `ws://127.0.0.1:${port}/api/ws`;
  return {
    url,
    api,
    ws,
    client: createProxyCaller(routesOf(api, "api"), { proxyPath: { ws: url } }),
  };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function told(subscription: Subscription<unknown>): string[] {
  const heard: string[] = [];
  subscription.on("open", (info: OpenInfo) => heard.push(`open ${info.first}`));
  subscription.on("data", (data) => heard.push(`data ${String(data)}`));
  subscription.on("close", (info: CloseInfo) => heard.push(`close ${info.reason}`));
  return heard;
}

describe("a push channel's subscription", () => {
  it('hands its values to on("data") through a proxy caller', async () => {
    const { client } = await serve();
    const heard = told(client.live.ticker());

    await vi.waitFor(() =>
      expect(heard).toEqual(["open true", "data 1", "data 2", "close completed"]),
    );
  });

  it('hands its values, not its statuses, to on("data") when opened directly', async () => {
    const { url } = await serve();
    const heard: unknown[] = [];

    executeWSPush<number>(url, "api.live.ticker").on("data", (value) => heard.push(value));

    await vi.waitFor(() => expect(heard).toEqual([1, 2]));
  });

  it("yields its values to a loop, which ends as the server ends it", async () => {
    const { client } = await serve();
    const values: unknown[] = [];

    for await (const event of client.live.ticker()) values.push(event.data);

    expect(values).toEqual([1, 2]);
  });
});

describe("a channel with send", () => {
  it("is connecting until the server has confirmed its subscription", async () => {
    const joining = deferred();
    const join = deferred();
    const { client } = await serve(
      {},
      {
        onJoin: async () => {
          joining.resolve();
          await join.promise;
        },
      },
    );
    const room = client.live.room();

    await joining.promise;
    expect(room.status).toBe("connecting");

    join.resolve();
    await vi.waitFor(() => expect(room.status).toBe("connected"));
    room.close();
  });

  it("is read with a loop as a push channel is", async () => {
    const { client } = await serve({}, { snapshot: "welcome" });
    const room = client.live.room();
    room.send("hi");
    const lines: unknown[] = [];

    for await (const event of room) {
      lines.push(event.data);
      if (lines.length === 2) break;
    }

    expect(lines).toEqual(["welcome", "echo:hi"]);
    expect(room.status).toBe("disconnected");
  });

  it("hands a snapshot and a broadcast both to its data listeners", async () => {
    const { client, ws } = await serve({}, { snapshot: "snapshot" });
    const room = client.live.room();
    const heard: string[] = [];
    room.on("data", (line) => heard.push(line));
    await vi.waitFor(() => expect(heard).toEqual(["snapshot"]));

    ws.connections.broadcastToTopic("api.live.room", "update");

    await vi.waitFor(() => expect(heard).toEqual(["snapshot", "update"]));
    room.close();
  });

  it("signs in again in place after the server refused it with 4401, its listeners kept", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let token = "stale";
    const { api, url } = await serve(
      {
        onConnect: ({ auth }) => {
          if (auth?.token !== "fresh") throw new Error("expired");
          return { userId: "u1" };
        },
      },
      { snapshot: "welcome" },
    );
    const client = createProxyCaller(routesOf(api, "api"), {
      proxyPath: { ws: url },
      ws: { auth: () => ({ token }) },
    });
    const room = client.live.room();
    const errors: unknown[] = [];
    const lines: string[] = [];
    room.on("error", (error) => errors.push(error));
    room.on("data", (line) => lines.push(line));
    await vi.waitFor(() => expect(room.status).toBe("disconnected"));
    expect(errors).toEqual([expect.any(AuthError)]);

    token = "fresh";
    room.reconnect();

    await vi.waitFor(() => expect(room.status).toBe("connected"));
    await vi.waitFor(() => expect(lines).toEqual(["welcome"]));
    room.close();
  });
});

describe("a channel opened directly", () => {
  it("sends and hears on one socket with its server", async () => {
    const { url } = await serve();
    const room = executeWSChannel<string, string>(url, "api.live.room");
    const lines: string[] = [];
    room.on("data", (line) => lines.push(line));

    room.send("one");

    await vi.waitFor(() => expect(lines).toEqual(["echo:one"]));
    room.close();
  });
});
