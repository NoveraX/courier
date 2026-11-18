/**
 * A WebSocket handler's HTTP transport, for a client whose network lets no
 * socket through: the same connection over POST requests to the socket's
 * path. It opens with a stream or a poll that carries the client's first
 * frames, is admitted as a socket is, numbers the server's frames and
 * keeps each until the client acknowledges it, takes each of the client's
 * once, answers the heartbeat while the client is heard from, and closes
 * as a socket does.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWSHandler } from "../src/adapter/handle-ws";
import type { WSHandler, WSHandlerConfig } from "../src/adapter/ws-types";
import { _resetSourcesForTests, registerSources } from "../src/server/sources";
import { authFrame } from "./helpers/fake-socket";
import { eventsOf, messageOf, openOverHTTP, post } from "./helpers/http-client";

const handlers: WSHandler[] = [];

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  registerSources({});
});

afterEach(async () => {
  await Promise.all(handlers.splice(0).map((handler) => handler.destroy({ timeoutMs: 100 })));
  _resetSourcesForTests();
  vi.restoreAllMocks();
});

function serve(config: WSHandlerConfig = {}): WSHandler {
  const handler = createWSHandler({
    heartbeatIntervalMs: 60_000,
    onConnect: ({ auth }) => ({ userId: auth?.userId }),
    ...config,
  });
  handlers.push(handler);
  return handler;
}

function idOf(handler: WSHandler): string {
  return handler.connections.list()[0]?.connectionId ?? "";
}

describe("WSHandler.handleHTTP", () => {
  it("opens a connection with a stream that carries the client's auth, and admits it as a socket", async () => {
    const handler = serve();
    const { token, events, response } = await openOverHTTP(handler, "stream", [
      authFrame({ auth: { userId: "u1" } }),
    ]);

    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(token).toMatch(/^[0-9a-f]{16}\.[0-9a-f]{32}$/);
    const ok = await events.next();
    expect(ok?.id).toBe("1");
    expect(messageOf(ok)).toMatchObject({ type: "auth_ok" });
    expect(handler.connections.list()[0]?.meta).toMatchObject({ userId: "u1" });
    expect(handler.stats().http).toEqual({ connections: 1, streaming: 1, polling: 0 });
    await events.cancel();
  });

  it("answers a poll once there is a frame, and the next poll carries what came after the acknowledged one", async () => {
    const handler = serve();
    const { token, events } = await openOverHTTP(handler, "poll", [authFrame()]);
    expect((await events.rest()).map((event) => event.id)).toEqual(["1"]);

    const polled = post(handler, { op: "poll", token, ack: 1 });
    await expect.poll(() => handler.stats().http?.polling).toBe(1);
    handler.connections.send(idOf(handler), "first");
    handler.connections.send(idOf(handler), "second");
    const carried = await eventsOf(await polled).rest();

    expect(carried.map((event) => event.id)).toEqual(["2", "3"]);
  });

  it("sends again what an answer lost on the way carried, and never what the client took", async () => {
    const handler = serve();
    const { token, events } = await openOverHTTP(handler, "poll", [authFrame()]);
    await events.rest();
    handler.connections.send(idOf(handler), "kept");
    const lost = await eventsOf(await post(handler, { op: "poll", token, ack: 1 })).rest();
    handler.connections.send(idOf(handler), "after");

    const again = await eventsOf(await post(handler, { op: "poll", token, ack: 1 })).rest();
    const next = post(handler, { op: "poll", token, ack: 3 });
    handler.connections.send(idOf(handler), "last");

    expect(lost.map((event) => event.id)).toEqual(["2"]);
    expect(again.map((event) => event.id)).toEqual(["2", "3"]);
    expect((await eventsOf(await next).rest()).map((event) => event.id)).toEqual(["4"]);
    expect(handler.connections.list()[0]?.connectionId).toBe(idOf(handler));
  });

  it("takes each of the client's frames once, and refuses frames sent past one it missed", async () => {
    const handler = serve();
    const { token, events } = await openOverHTTP(handler, "stream", [authFrame()]);
    await events.next();
    const ping = { type: "ping" } as const;

    const sent = await post(handler, { op: "send", token, seq: 2 }, [ping]);
    const resent = await post(handler, { op: "send", token, seq: 2 }, [ping]);
    const skipped = await post(handler, { op: "send", token, seq: 5 }, [ping]);

    expect([sent.status, resent.status, skipped.status]).toEqual([204, 204, 409]);
    const pongs = [await events.next(), await Promise.race([events.next(), tick(50)])];
    expect(pongs.map((event) => event && messageOf(event).type)).toEqual(["pong", undefined]);
    await events.cancel();
  });

  it("answers the heartbeat while a stream is held, and closes a connection no request comes for", async () => {
    const handler = serve({ heartbeatIntervalMs: 40, heartbeatTimeoutMs: 40 });
    const streamed = await openOverHTTP(handler, "stream", [authFrame({ auth: { userId: "s" } })]);
    const polled = await openOverHTTP(handler, "poll", [authFrame({ auth: { userId: "p" } })]);
    await streamed.events.next();
    await polled.events.rest();

    await expect.poll(() => handler.stats().closed).toEqual({ 4408: 1 });
    const pinged = await streamed.events.next();
    const told = await eventsOf(
      await post(handler, { op: "poll", token: polled.token, ack: 1 }),
    ).rest();

    expect(pinged?.id).toBeUndefined();
    expect(messageOf(pinged)).toEqual({ type: "ping" });
    expect(told.map((event) => event.event ?? messageOf(event).type)).toEqual([
      "ping",
      "disconnect",
      "close",
    ]);
    expect(JSON.parse(told[2]?.data ?? "")).toMatchObject({ code: 4408 });
    expect(handler.connections.list().map((connection) => connection.meta.userId)).toEqual(["s"]);
    await streamed.events.cancel();
  });

  it("tells the client of the server's close after its last frame, and closes with the client's own code", async () => {
    const handler = serve();
    const first = await openOverHTTP(handler, "stream", [authFrame({ auth: { userId: "a" } })]);
    const second = await openOverHTTP(handler, "poll", [authFrame({ auth: { userId: "b" } })]);
    await first.events.next();
    await second.events.rest();

    await handler.connections.disconnect({ meta: { userId: "a" } }, { code: 4000, reason: "bye" });
    const told = await first.events.rest();
    const closed = await post(handler, { op: "close", token: second.token, code: 4001 });

    expect(told.map((event) => event.event ?? messageOf(event).type)).toEqual([
      "disconnect",
      "close",
    ]);
    expect(JSON.parse(told[1]?.data ?? "")).toEqual({ code: 4000, reason: "bye" });
    expect(closed.status).toBe(204);
    expect(handler.connections.list()).toEqual([]);
    const gone = await post(handler, { op: "poll", token: second.token });
    expect(gone.status).toBe(410);
  });

  it("ends a stream after streamMs, and the next one carries on where it ended", async () => {
    const handler = serve({ http: { streamMs: 50 } });
    const { token, events } = await openOverHTTP(handler, "stream", [authFrame()]);
    expect((await events.rest()).map((event) => event.id)).toEqual(["1"]);

    const next = eventsOf(await post(handler, { op: "stream", token, ack: 1 }));
    handler.connections.send(idOf(handler), "on");

    expect((await next.next())?.id).toBe("2");
    await next.cancel();
  });

  it("closes a connection whose first stream its client gave up before using its token", async () => {
    const handler = serve();
    const { events } = await openOverHTTP(handler, "stream", [authFrame()]);
    await events.next();

    await events.cancel();

    await expect.poll(() => handler.stats().http?.connections).toBe(0);
    expect(handler.connections.list()).toEqual([]);
  });

  it("refuses what is no request of the transport", async () => {
    const handler = serve({ maxMessageSize: 1_000 });
    const url = "http://localhost/api/ws";

    const statuses = await Promise.all([
      handler.handleHTTP(new Request(url)),
      handler.handleHTTP(new Request(url, { method: "POST", body: "not json" })),
      post(handler, { op: "stream", v: 99 }),
      post(handler, { op: "send", token: "nobody" }),
      handler.handleHTTP(new Request(url, { method: "POST", body: "x".repeat(1_048_577) })),
      serve({ http: false }).handleHTTP(new Request(url, { method: "POST", body: "{}" })),
    ]);

    expect(statuses.map((response) => response.status)).toEqual([405, 400, 400, 410, 413, 404]);
  });

  it("refuses an opening from an origin its sockets are refused for, and lets a listed one read its answers", async () => {
    const handler = serve({ allowedOrigins: ["https://app.example"] });
    const from = (origin: string) =>
      new Request("http://localhost/api/ws", {
        method: "POST",
        headers: { Origin: origin, "Sec-Fetch-Site": "cross-site" },
        body: '{"op":"poll","v":1}',
      });

    const refused = await handler.handleHTTP(from("https://elsewhere.example"));
    const listed = await handler.handleHTTP(from("https://app.example"));

    expect(refused.status).toBe(403);
    expect(listed.status).toBe(200);
    expect(listed.headers.get("access-control-allow-origin")).toBe("https://app.example");
    expect(listed.headers.get("access-control-allow-credentials")).toBe("true");
    expect(handler.stats().http?.connections).toBe(1);
    await eventsOf(listed).cancel();
  });
});

function tick(ms: number): Promise<undefined> {
  return new Promise((resolve) => setTimeout(() => resolve(undefined), ms));
}
