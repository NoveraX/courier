/**
 * A client's connection carried over a WebSocket handler's HTTP transport,
 * the client driving it as a socket: it is admitted with the request that
 * opens it, hears its topic's events in order and sends on it, on a stream
 * or on polls. An answer lost on the way loses nothing and doubles nothing;
 * a stream something on the way holds back gives way to polls; a stream
 * rotated by the server goes on where it ended; and a connection whose
 * replica stopped is opened again on another, its topic resumed from the
 * log where it was.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWSHandler } from "../src/adapter/handle-ws";
import type { WSHandler, WSHandlerConfig } from "../src/adapter/ws-types";
import { defineApi } from "../src/define/api";
import { courier } from "../src/define/courier";
import { defineGroup } from "../src/define/group";
import { createMemoryBus } from "../src/realtime/memory-bus";
import { createWSConnection } from "../src/realtime/ws/ws-connection";
import type { WSConnection } from "../src/realtime/ws/ws-types";
import { createHTTPSocket } from "../src/realtime/ws-http/http-socket";
import type { HTTPMode, HTTPSocket } from "../src/realtime/ws-http/http-socket-types";
import { _resetSourcesForTests, registerSources } from "../src/server/sources";
import { type EntryWay, entryTo, holdingStreams } from "./helpers/http-entry";

const TOPIC = "api.live.room";
const { channel } = courier();
const api = defineApi({
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
          .implement(() => ({ onMessage: (ctx, message) => ctx.send(`echo:${message}`) })),
      },
    }),
  },
});

const handlers: WSHandler[] = [];
const connections: WSConnection[] = [];

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  registerSources({ api } as never);
});

afterEach(async () => {
  for (const connection of connections.splice(0)) connection.close();
  await Promise.all(handlers.splice(0).map((handler) => handler.destroy({ timeoutMs: 100 })));
  _resetSourcesForTests();
  vi.restoreAllMocks();
});

function serve(config: WSHandlerConfig = {}): WSHandler {
  const handler = createWSHandler({ heartbeatIntervalMs: 60_000, ...config });
  handlers.push(handler);
  return handler;
}

/** A connection whose sockets go over HTTP through `fetch`, subscribed to the room. */
function connect(fetch: typeof globalThis.fetch, mode: HTTPMode, probeMs = 3000) {
  const sockets: HTTPSocket[] = [];
  const connection = createWSConnection({
    url: "ws://localhost/api/ws",
    socketFactory: (url) => {
      const socket = createHTTPSocket(url, { fetch, mode, probeMs });
      sockets.push(socket);
      return socket;
    },
  });
  connections.push(connection);
  const heard: string[] = [];
  const resumed: boolean[] = [];
  connection.subscribe(TOPIC, {
    data: (payload) => heard.push(String(payload)),
    open: (info) => resumed.push(info.resumed),
  });
  return { connection, heard, resumed, sockets };
}

async function publish(handler: WSHandler, ...texts: string[]): Promise<void> {
  for (const text of texts) await handler.connections.broadcastToTopic(TOPIC, text);
}

describe("a connection over the HTTP transport", () => {
  it("opens with one request on a stream, hears its topic's events in order, and sends on it", async () => {
    const a = serve();
    const { fetch, log } = entryTo([a]);
    const { connection, heard, resumed } = connect(fetch, "stream");
    await expect.poll(() => resumed.length).toBe(1);

    await publish(a, "one", "two", "three");
    connection.send(TOPIC, "hi");

    await expect.poll(() => heard).toEqual(["one", "two", "three", "echo:hi"]);
    expect(connection.status).toBe("connected");
    expect(a.stats().http).toMatchObject({ connections: 1, streaming: 1, polling: 0 });
    expect(log.heads.map((head) => head.op)).toEqual(["stream", "send"]);
  });

  it.each(["stream", "poll"] as const)(
    "ends at the server with the code it closed with, on a %s let go of once the close came",
    async (mode) => {
      const ends: number[] = [];
      const a = serve({ onDisconnect: ({ code }) => void ends.push(code) });
      const { fetch, log } = entryTo([a]);
      const { connection, resumed } = connect(fetch, mode);
      await expect.poll(() => resumed.length).toBe(1);

      connection.close();

      await expect.poll(() => ends).toEqual([1000]);
      expect(log.heads.at(-1)).toMatchObject({ op: "close", code: 1000 });
      expect(a.connections.count).toBe(0);
    },
  );

  it("acknowledges on a stream, unasked, each time it has read the bytes the server asked for", async () => {
    const a = serve({ maxBufferedAmount: 4096 });
    const { fetch, log } = entryTo([a]);
    const { heard, resumed } = connect(fetch, "stream");
    await expect.poll(() => resumed.length).toBe(1);

    /* Each event is over the 1024 bytes asked for: its characters take three bytes each. */
    for (const text of ["\u4e00", "\u4e8c", "\u4e09", "\u56db"]) {
      await publish(a, text.repeat(400));
      await expect.poll(() => heard.at(-1)).toBe(text.repeat(400));
    }

    expect(heard).toHaveLength(4);
    expect(log.heads.filter((head) => head.op === "send").length).toBeGreaterThanOrEqual(4);
  });

  it("opens with a poll, and hears each event on the poll that is held when it comes", async () => {
    const a = serve();
    const { fetch, log } = entryTo([a]);
    const { connection, heard, resumed } = connect(fetch, "poll");
    await expect.poll(() => resumed.length).toBe(1);

    for (const text of ["one", "two"]) {
      await expect.poll(() => a.stats().http?.polling).toBe(1);
      await publish(a, text);
      await expect.poll(() => heard.at(-1)).toBe(text);
    }
    connection.send(TOPIC, "hi");

    await expect.poll(() => heard).toEqual(["one", "two", "echo:hi"]);
    expect(log.heads[0]).toMatchObject({ op: "poll", v: 1 });
    expect(log.heads.slice(1).every((head) => head.token !== undefined)).toBe(true);
  });

  it("takes each event once when an answer that carried it was lost on the way", async () => {
    const a = serve();
    let lost = 0;
    const losing: EntryWay = async (head, pass) => {
      const answer = await pass();
      if (head.op !== "poll" || head.token === undefined) return answer;
      const text = await answer.text();
      if (lost === 0 && text.includes('"type":"data"')) {
        lost++;
        throw new TypeError("The network dropped the answer");
      }
      return new Response(text, { status: answer.status, headers: answer.headers });
    };
    const { fetch } = entryTo([a], losing);
    const { heard, resumed } = connect(fetch, "poll");
    await expect.poll(() => resumed.length).toBe(1);

    await expect.poll(() => a.stats().http?.polling).toBe(1);
    await publish(a, "one");
    await publish(a, "two");
    await expect.poll(() => heard.length).toBe(2);
    await publish(a, "three");

    await expect.poll(() => heard).toEqual(["one", "two", "three"]);
    expect(lost).toBe(1);
    expect(a.stats().http?.resent).toBeGreaterThan(0);
  });

  it("takes polls once a stream's first bytes are held back on the way, and goes on there", async () => {
    const a = serve();
    const { fetch, log } = entryTo([a], holdingStreams);
    const { heard, resumed, sockets } = connect(fetch, "stream", 100);
    await expect.poll(() => resumed.length).toBe(1);

    await expect.poll(() => a.stats().http?.polling).toBe(1);
    await publish(a, "one", "two");

    await expect.poll(() => heard).toEqual(["one", "two"]);
    expect(sockets.map((socket) => socket.mode)).toEqual(["poll"]);
    expect(log.heads.slice(0, 2).map((head) => [head.op, head.v])).toEqual([
      ["stream", 1],
      ["poll", 1],
    ]);
    await expect.poll(() => a.stats().http?.connections).toBe(1);
  });

  it("goes on where its stream ended when the server ends it after streamMs", async () => {
    const a = serve({ http: { streamMs: 40 } });
    const { fetch } = entryTo([a]);
    const { heard, resumed } = connect(fetch, "stream");
    await expect.poll(() => resumed.length).toBe(1);

    for (const text of ["one", "two", "three", "four"]) {
      await publish(a, text);
      await new Promise((resume) => setTimeout(resume, 25));
    }

    await expect.poll(() => heard).toEqual(["one", "two", "three", "four"]);
    expect(a.stats().http?.rotated).toBeGreaterThan(1);
  });

  it("opens another connection on another replica once its own stopped, its topic resumed from the log", {
    timeout: 15_000,
  }, async () => {
    const bus = createMemoryBus({ log: {} });
    const [a, b] = [serve({ pubsub: bus.replica("a") }), serve({ pubsub: bus.replica("b") })];
    const replicas = [a];
    const { fetch } = entryTo(replicas);
    const { heard, resumed } = connect(fetch, "stream");
    await expect.poll(() => resumed.length).toBe(1);
    await publish(b, "one", "two");
    await expect.poll(() => heard).toEqual(["one", "two"]);

    replicas.splice(0, 1, b);
    await a.destroy({ timeoutMs: 1000 });
    await publish(b, "three", "four");

    await expect.poll(() => resumed.length, { timeout: 10_000 }).toBe(2);
    await publish(b, "five");
    await expect.poll(() => heard).toEqual(["one", "two", "three", "four", "five"]);
    expect(resumed).toEqual([false, true]);
    expect(b.stats().http?.connections).toBe(1);
  });
});
