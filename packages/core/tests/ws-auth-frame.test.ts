/**
 * The frame a client proves who it is with, end to end on a real server:
 * the first a Courier client sends on every socket, carrying what a browser
 * cannot put on a WebSocket handshake — an `Authorization`, an API key — and
 * the caller's `ws.auth`, never in the URL.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { courier } from "../src/define/courier";
import { defineMiddleware } from "../src/middleware/define";
import type { WSCredentials } from "../src/realtime/ws/ws-credentials";
import { executeWSChannel } from "../src/realtime/ws-channel-client";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { type ServedWS, serveWS, settle, stopWS } from "./helpers/ws-server";

const { channel } = courier();
let served: ServedWS | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  await stopWS(served);
  served = undefined;
});

const room = channel
  .send<string>()
  .response<string>()
  .implement(() => ({ onJoin: (ctx) => ctx.send("welcome"), onMessage() {} }));

function openRoom(url: string, credentials: () => WSCredentials) {
  const ch = executeWSChannel<string, string>(url, "api.live.room", undefined, { credentials });
  const heard: string[] = [];
  ch.on("data", (data) => heard.push(data));
  return { ch, heard };
}

describe("a client's auth frame", () => {
  it("reaches onConnect: its headers on the request, its auth as auth", async () => {
    const seen: Array<{ authorization: string | null; auth: unknown; url: string }> = [];
    served = await serveWS(
      { room },
      {
        onConnect: ({ request, auth }) => {
          seen.push({
            authorization: request.headers.get("authorization"),
            auth,
            url: request.url,
          });
          return {};
        },
      },
    );

    const { ch, heard } = openRoom(served.url, () => ({
      frame: { headers: { authorization: "Bearer t1" }, auth: { tenant: "acme" } },
    }));
    await vi.waitFor(() => expect(heard).toEqual(["welcome"]));

    expect(seen).toEqual([
      {
        authorization: "Bearer t1",
        auth: { tenant: "acme" },
        url: expect.not.stringContaining("?"),
      },
    ]);
    ch.close();
  });

  it("adds nothing the handshake carries, nor a cookie, an origin or a forwarding header", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let request: Request | undefined;
    served = await serveWS(
      { room },
      {
        onConnect: (info) => {
          request = info.request;
        },
      },
    );

    const { ch, heard } = openRoom(served.url, () => ({
      handshake: { authorization: "Bearer from-handshake" },
      frame: {
        headers: {
          authorization: "Bearer from-frame",
          cookie: "sid=mallory",
          origin: "https://evil.example",
          "x-forwarded-for": "198.51.100.9",
        },
      },
    }));
    await vi.waitFor(() => expect(heard).toEqual(["welcome"]));

    expect(request?.headers.get("authorization")).toBe("Bearer from-handshake");
    expect(request?.headers.has("cookie")).toBe(false);
    expect(request?.headers.get("origin")).not.toBe("https://evil.example");
    expect(request?.headers.has("x-forwarded-for")).toBe(false);
    ch.close();
  });

  it("reaches the middleware of every subscription on a handler with no onConnect", async () => {
    const seen: Array<string | null | undefined> = [];
    served = await serveWS({ room });
    registerSources({
      api: {
        options: {
          expose: true,
          middleware: [
            defineMiddleware("who", "before", (ctx) => {
              seen.push(ctx.request?.headers.get("x-api-key"));
            }),
          ],
          groups: { live: { options: {}, room } },
        },
      },
    } as never);

    const { ch, heard } = openRoom(served.url, () => ({
      frame: { headers: { "x-api-key": "k1" } },
    }));
    await vi.waitFor(() => expect(heard).toEqual(["welcome"]));

    expect(seen).toEqual(["k1"]);
    ch.close();
    _resetSourcesForTests();
  });

  it("refuses the connection when it is not one a client sends", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const onConnect = vi.fn(() => ({}));
    served = await serveWS({ room }, { onConnect });
    const socket = new WebSocket(served.url);
    const closed = new Promise<number>((resolve) => {
      socket.onclose = (event) => resolve(event.code);
    });
    await new Promise((resolve) => {
      socket.onopen = resolve;
    });

    socket.send(JSON.stringify({ type: "auth", payload: { headers: { authorization: 42 } } }));

    expect(await closed).toBe(4401);
    expect(onConnect).not.toHaveBeenCalled();
  });

  it.each([
    ["with an onConnect", { onConnect: () => ({}) }],
    ["without one", {}],
  ])(
    "refuses a frame whose header HTTP cannot carry, and goes on serving the rest (%s)",
    async (_label, config) => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      served = await serveWS({ room }, config);
      const socket = new WebSocket(served.url);
      const answered = new Promise<string>((resolve) => {
        socket.onmessage = (event) => resolve(String(event.data));
        socket.onclose = (event) => resolve(`closed ${event.code}`);
      });
      await new Promise((resolve) => {
        socket.onopen = resolve;
      });

      socket.send(JSON.stringify({ type: "auth", payload: { headers: { "x-bad name": "1" } } }));

      expect(await answered).toMatch(/^closed 4401$|"code":4400/);
      const { ch, heard } = openRoom(served.url, () => ({}));
      await vi.waitFor(() => expect(heard).toEqual(["welcome"]));
      ch.close();
      socket.close();
    },
  );

  it("is sent before every subscription, again on every reconnect", async () => {
    const frames: unknown[] = [];
    served = await serveWS({ room }, { onConnect: ({ auth }) => void frames.push(auth) });
    let issued = 0;

    const { ch, heard } = openRoom(served.url, () => ({
      frame: { auth: { token: `t${++issued}` } },
    }));
    await vi.waitFor(() => expect(heard).toEqual(["welcome"]));
    for (const connection of served.handler.connections.list()) {
      served.handler.connections.disconnect(connection.connectionId, 1012, "Service restart");
    }
    await vi.waitFor(() => expect(heard).toEqual(["welcome", "welcome"]), { timeout: 5000 });
    await settle(20);

    expect(frames).toEqual([{ token: "t1" }, { token: "t2" }]);
    ch.close();
  });
});
