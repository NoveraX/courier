/**
 * What a source says about its transport reaches every request it makes.
 * Its own `fetch` sends its calls — plain ones, uploads that report their
 * progress, each hop of a redirect followed by hand — and opens its
 * streams; its `WebSocket` class opens its channels' sockets. What its
 * options give a request — a `dispatcher`, `credentials` — reaches both,
 * while Courier's own options never reach `fetch`, and its channels still
 * share one socket.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocketServer } from "ws";

import { createWSHandler } from "../src/adapter/handle-ws";
import type { WSHandler } from "../src/adapter/ws-types";
import { createCaller } from "../src/caller";
import { defineApi } from "../src/define/api";
import { courier } from "../src/define/courier";
import { defineGroup } from "../src/define/group";
import type {
  PlatformFetch,
  SourceDispatcher,
  SourceSocketOptions,
} from "../src/http-client/source-transport";
import { attachWebSocketUpgrade, type UpgradeServer } from "../src/node";
import { clearWSConnectionPool } from "../src/realtime/caller-ws";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { coreFetch } from "../src/utils/fetch";

const { endpoint, stream, channel } = courier();

/* Stands in for undici's: Courier hands it on and never calls it. */
const dispatcher: SourceDispatcher = { dispatch: () => true };

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

function recording(answer: (url: string) => Response) {
  const sent: Array<{ url: string; init: RequestInit }> = [];
  const send: PlatformFetch = async (url, init) => {
    sent.push({ url, init });
    /* Taken as fetch takes it, which is when an upload's progress is reported. */
    if (init.body instanceof ReadableStream) await new Response(init.body).arrayBuffer();
    return answer(url);
  };
  return { sent, send };
}

describe("a source's fetch", () => {
  it("sends its calls, with the request options it gives and none of Courier's own", async () => {
    const { sent, send } = recording(() => Response.json({ id: "p_1" }));
    const shop = defineApi({
      expose: true,
      name: "shop",
      baseURL: "https://shop.example",
      fetch: send,
      dispatcher,
      credentials: "include",
      proxyPath: { http: "/api/courier" },
      endpoints: { product: endpoint.get("products/p_1") },
    });

    const product = await createCaller(shop).product();

    expect(product).toEqual({ id: "p_1" });
    expect(sent.map(({ url }) => url)).toEqual(["https://shop.example/products/p_1"]);
    expect(sent[0]?.init).toMatchObject({ dispatcher, credentials: "include", method: "GET" });
    for (const own of ["fetch", "webSocket", "expose", "proxyPath"]) {
      expect(sent[0]?.init).not.toHaveProperty(own);
    }
  });

  it("sends an upload that reports its progress", async () => {
    const { sent, send } = recording(() => new Response("stored"));
    const progress = vi.fn();

    const response = await coreFetch("POST", "https://files.example/upload", {
      body: new Blob(["twelve bytes"]),
      onUploadProgress: progress,
      fetch: send,
    });

    expect(await response.text()).toBe("stored");
    expect(sent.map(({ url }) => url)).toEqual(["https://files.example/upload"]);
    expect(sent[0]?.init.body).toBeInstanceOf(ReadableStream);
    expect(progress).toHaveBeenLastCalledWith({ percent: 1, totalBytes: 12, transferredBytes: 12 });
  });

  it("sends each hop of a redirect it follows on the request's origin", async () => {
    const { sent, send } = recording((url) =>
      url.endsWith("/old")
        ? new Response(null, { status: 302, headers: { location: "/new" } })
        : new Response("moved here"),
    );

    const response = await coreFetch("GET", "https://shop.example/old", {
      withinOrigin: true,
      fetch: send,
    });

    expect(await response.text()).toBe("moved here");
    expect(sent.map(({ url }) => url)).toEqual([
      "https://shop.example/old",
      "https://shop.example/new",
    ]);
  });

  it("opens its streams, with the options a request that stays open takes", async () => {
    const { sent, send } = recording(
      () =>
        new Response("data: 1\n\ndata: 2\n\nevent: courier:complete\ndata: null\n\n", {
          headers: { "content-type": "text/event-stream" },
        }),
    );
    const feed = defineApi({
      expose: true,
      name: "feed",
      baseURL: "https://feed.example",
      fetch: send,
      dispatcher,
      credentials: "include",
      endpoints: { ticks: stream.response<number>().get("ticks") },
    });

    const received: number[] = [];
    for await (const tick of createCaller(feed).ticks()) received.push(tick.data);

    expect(received).toEqual([1, 2]);
    expect(sent.map(({ url }) => url)).toEqual(["https://feed.example/ticks"]);
    expect(sent[0]?.init).toMatchObject({ dispatcher, credentials: "include" });
    expect(sent[0]?.init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("a source's transport that cannot be used", () => {
  it.each(["fetch", "webSocket"])(
    "is refused where it is defined, a %s that is not a function",
    (option) => {
      const define = () =>
        defineApi({
          expose: true,
          name: "shop",
          baseURL: "https://shop.example",
          [option]: "undici",
          endpoints: {},
        } as never);

      expect(define).toThrow(
        expect.objectContaining({
          code: "SOURCE_TRANSPORT_INVALID",
          message: `[courier] A source's ${option} must be a function; it is string.`,
        }),
      );
    },
  );

  it("fails a call whose fetch answers with something other than a Response, saying so", async () => {
    const shop = defineApi({
      expose: true,
      name: "shop",
      baseURL: "https://shop.example",
      fetch: async () => ({ id: "p_1" }),
      endpoints: { product: endpoint.get("products/p_1") },
    });

    await expect(createCaller(shop).product()).rejects.toMatchObject({
      name: "ConfigurationError",
      code: "SOURCE_TRANSPORT_INVALID",
      message:
        "[courier] The source's fetch answered https://shop.example/products/p_1 with something that is not a Response.",
    });
  });
});

describe("a source's WebSocket", () => {
  /** Serve `api.live.room` on every path. */
  async function serveRoom(): Promise<string> {
    registerSources({
      api: defineApi({
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
                .implement(() => ({ onMessage: () => undefined })),
            },
          }),
        },
      }),
    } as never);
    handler = createWSHandler();
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

  it("opens the socket its channels share, with the connection options the source gives", async () => {
    const host = await serveRoom();
    const opened: SourceSocketOptions[] = [];
    class RecordingWebSocket extends WebSocket {
      constructor(url: string, options: SourceSocketOptions) {
        opened.push(options);
        super(url, options.protocols);
      }
    }
    const remote = defineApi({
      expose: true,
      name: "api",
      baseURL: `http://${host}`,
      webSocket: RecordingWebSocket,
      dispatcher,
      credentials: "include",
      groups: {
        live: defineGroup({
          prefix: "live",
          endpoints: { room: channel.send<string>().response<string>().connect("room") },
        }),
      },
    });
    const client = createCaller(remote);

    const first = client.live.room();
    const second = client.live.room();
    await vi.waitFor(() =>
      expect([first.status, second.status]).toEqual(["connected", "connected"]),
    );

    expect(opened).toEqual([{ dispatcher }]);
    first.close();
    second.close();
  });
});
