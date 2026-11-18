/**
 * A connection whose WebSocket does not get through — its upgrade refused
 * or held, or its server's frames held back on the way — goes on over HTTP
 * to the same path: at once for a refusal, after `after` otherwise, the
 * server admitting it once, with the frames it sent going with the request
 * that opens it. One whose WebSocket works sends no request over HTTP. The
 * next connection to the path starts on the rung the last one reached, and
 * one where no HTTP transport answers keeps to WebSocket. A connection
 * whose WebSocket and request over HTTP both failed never opened.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWSHandler } from "../src/adapter/handle-ws";
import type { WSHandler, WSHandlerConfig } from "../src/adapter/ws-types";
import { defineApi } from "../src/define/api";
import { courier } from "../src/define/courier";
import { defineGroup } from "../src/define/group";
import type { WSTransport } from "../src/realtime/ws/connection-machine-types";
import { createWSConnection } from "../src/realtime/ws/ws-connection";
import type { WSConnection, WSConnectionConfig } from "../src/realtime/ws/ws-types";
import { _resetSourcesForTests, registerSources } from "../src/server/sources";
import { type EntryWay, entryTo, holdingStreams } from "./helpers/http-entry";
import { type SocketWay, socketsTo } from "./helpers/socket-pair";

const TOPIC = "api.live.room";
const FAST = { initialMs: 5, maxMs: 5, jitter: false };
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
let places = 0;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  registerSources({ api } as never);
});

afterEach(async () => {
  for (const connection of connections.splice(0)) connection.close();
  await Promise.all(handlers.splice(0).map((handler) => handler.destroy({ timeoutMs: 100 })));
  _resetSourcesForTests();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function serve(config: WSHandlerConfig = {}): WSHandler {
  const handler = createWSHandler({ heartbeatIntervalMs: 60_000, ...config });
  handlers.push(handler);
  return handler;
}

/* Each test's connections go to a path of their own: the page keeps the rung each path reached. */
function place(): string {
  return `ws://place-${++places}.localhost/api/ws`;
}

/** A connection subscribed to the room, its WebSockets going through `way`, its requests over HTTP through `fetch`. */
function connect(
  handler: WSHandler,
  way: SocketWay,
  config: Partial<WSConnectionConfig> & { readonly fetch: WSConnectionConfig["fetch"] },
) {
  const sockets = socketsTo(handler, way);
  const connection = createWSConnection({
    url: place(),
    socketFactory: sockets.factory,
    fallback: { after: 100 },
    backoff: FAST,
    ...config,
  });
  connections.push(connection);
  const heard: string[] = [];
  const admitted: number[] = [];
  const began = performance.now();
  connection.subscribe(TOPIC, {
    data: (payload) => heard.push(String(payload)),
    open: () => admitted.push(performance.now() - began),
  });
  return { connection, heard, admitted, sockets };
}

function transportOf(connection: WSConnection): WSTransport | undefined {
  const { state } = connection;
  return state.phase === "open" ? state.transport : undefined;
}

describe("a connection whose WebSocket does not get through", () => {
  it("goes on over HTTP at once when its upgrade is refused, the frames it sent going with the opening", async () => {
    const a = serve();
    const { fetch, log } = entryTo([a]);
    const { connection, heard, admitted } = connect(a, "refuse", {
      fetch,
      fallback: { after: 5000 },
    });
    await expect.poll(() => admitted.length).toBe(1);

    await a.connections.broadcastToTopic(TOPIC, "one");
    connection.send(TOPIC, "hi");

    await expect.poll(() => heard).toEqual(["one", "echo:hi"]);
    expect(admitted[0]).toBeLessThan(1000);
    expect(transportOf(connection)).toBe("stream");
    expect(log.heads[0]).toMatchObject({ op: "stream", v: 1, cause: "refused" });
    expect(a.stats().http?.fallbacks).toMatchObject({ refused: 1, held: 0, silent: 0 });
  });

  it("waits `after` for an upgrade held on the way, then goes on over HTTP", async () => {
    const a = serve();
    const { fetch, log } = entryTo([a]);
    const { connection, admitted } = connect(a, "hold", { fetch });
    await expect.poll(() => admitted.length).toBe(1);

    expect(admitted[0]).toBeGreaterThanOrEqual(95);
    expect(transportOf(connection)).toBe("stream");
    expect(log.heads[0]).toMatchObject({ op: "stream", cause: "held" });
  });

  it("lets go of a WebSocket whose server's frames are held back, and is admitted once more over HTTP", async () => {
    const admissions: string[] = [];
    const ends: number[] = [];
    const a = serve({
      onConnect: ({ connectionId }) => void admissions.push(connectionId),
      onDisconnect: ({ code }) => void ends.push(code),
    });
    const { fetch, log } = entryTo([a]);
    const { connection, heard, admitted } = connect(a, "silent", { fetch });
    await expect.poll(() => admitted.length).toBe(1);
    await a.connections.broadcastToTopic(TOPIC, "one");

    await expect.poll(() => heard).toEqual(["one"]);
    expect(transportOf(connection)).toBe("stream");
    expect(log.heads[0]).toMatchObject({ op: "stream", cause: "silent" });
    expect(admissions).toHaveLength(2);
    await expect.poll(() => ends).toEqual([4100]);
    expect(a.connections.list()).toHaveLength(1);
  });

  it("tells what carries it as that changes: a stream, then polls once a stream is held back", async () => {
    /* A stream the server ends before the probe's wait would come whole through the entry, held or not. */
    const a = serve({ http: { streamMs: 300 } });
    let streams = 0;
    const laterStreamsHeld: EntryWay = (head, pass, signal) =>
      head.op === "stream" && streams++ > 0 ? holdingStreams(head, pass, signal) : pass();
    const { fetch } = entryTo([a], laterStreamsHeld);
    const { connection, heard, admitted } = connect(a, "refuse", { fetch });
    const carried: WSTransport[] = [];
    connection.onStateChange((state) => {
      if (state.phase === "open" && carried.at(-1) !== state.transport) {
        carried.push(state.transport);
      }
    });
    await expect.poll(() => admitted.length).toBe(1);

    await expect.poll(() => carried, { timeout: 5000 }).toEqual(["stream", "poll"]);
    await expect.poll(() => a.stats().http?.polling).toBe(1);
    await a.connections.broadcastToTopic(TOPIC, "one");
    await expect.poll(() => heard).toEqual(["one"]);
  });

  it("never opened when neither its WebSocket nor its request over HTTP reached a server", async () => {
    const a = serve();
    const refused = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:9"), {
      code: "ECONNREFUSED",
    });
    const fetch = vi.fn(async () => {
      throw new TypeError("fetch failed", { cause: refused });
    });
    const { connection, sockets } = connect(a, "refuse", { fetch });

    await expect.poll(() => connection.state.phase).toBe("reconnecting");
    expect(connection.state).toMatchObject({
      cause: { kind: "closed", code: 1006, opened: false, error: { error: { cause: refused } } },
    });
    await expect.poll(() => sockets.opened()).toBeGreaterThanOrEqual(2);
    expect(fetch.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});

describe("a connection whose WebSocket gets through", () => {
  it("sends no request over HTTP", async () => {
    const a = serve();
    const fetch = vi.fn(globalThis.fetch);
    const { connection, heard, admitted } = connect(a, "pass", { fetch });
    await expect.poll(() => admitted.length).toBe(1);
    await a.connections.broadcastToTopic(TOPIC, "one");

    await expect.poll(() => heard).toEqual(["one"]);
    expect(transportOf(connection)).toBe("websocket");
    expect(fetch).not.toHaveBeenCalled();
    expect(a.stats().http?.connections).toBe(0);
  });
});

describe("the rung a path reached", () => {
  it("is where the next connection to it starts, its WebSocket not tried", async () => {
    const a = serve();
    const { fetch, log } = entryTo([a], holdingStreams);
    const url = place();
    const first = connect(a, "refuse", { fetch, url });
    await expect.poll(() => first.admitted.length).toBe(1);
    first.connection.close();

    const next = connect(a, "refuse", { fetch, url });
    await expect.poll(() => next.admitted.length).toBe(1);

    expect(transportOf(next.connection)).toBe("poll");
    expect(next.sockets.opened()).toBe(0);
    expect(log.heads.filter((head) => head.v !== undefined).map((head) => head.cause)).toEqual([
      "refused",
      "refused",
      "remembered",
    ]);
    expect(a.stats().http?.fallbacks).toMatchObject({ refused: 2, remembered: 1 });
  });

  it("keeps to WebSocket where no HTTP transport answers", async () => {
    const a = serve({ http: false });
    const { fetch, log } = entryTo([a]);
    const { connection, sockets } = connect(a, "refuse", { fetch });

    await expect.poll(() => sockets.opened()).toBeGreaterThanOrEqual(3);
    expect(log.heads).toHaveLength(1);
    expect(connection.state.phase).not.toBe("open");
  });

  it("is kept in the tab's session for its path, so the page loaded again starts there; a missing transport only for the page", async () => {
    const stored = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
      removeItem: (key: string) => void stored.delete(key),
    });
    const [polled, absent, forgotten] = [place(), place(), place()];
    const { rungMemory } = await import("../src/realtime/ws/rung-memory");
    const memory = rungMemory(true);
    memory.set(`${polled}?token=t0k3n`, "poll");
    memory.set(absent, "absent");
    memory.set(forgotten, "stream");
    memory.forget(forgotten);
    rungMemory(false).set(place(), "stream");

    vi.resetModules();
    const reloaded = (await import("../src/realtime/ws/rung-memory")).rungMemory(true);

    expect([`${polled}?v=2`, absent, forgotten].map((url) => reloaded.get(url))).toEqual([
      "poll",
      undefined,
      undefined,
    ]);
    expect([...stored.keys()]).toEqual([`courier:ws:${polled}`]);
  });
});

describe("the fallback's options", () => {
  it.each([0, 1.5, 15_000, Number.NaN])("refuse an `after` of %s ms", (after) => {
    const socketFactory = vi.fn();
    expect(() => createWSConnection({ url: place(), fallback: { after }, socketFactory })).toThrow(
      expect.objectContaining({ code: "INVALID_FALLBACK" }),
    );
    expect(socketFactory).not.toHaveBeenCalled();
  });

  it("climb no ladder for a socket factory of the application's own, unless it asks", async () => {
    const a = serve();
    const { fetch, log } = entryTo([a]);
    const off = connect(a, "refuse", { fetch, fallback: undefined });
    await expect.poll(() => off.sockets.opened()).toBeGreaterThanOrEqual(2);
    expect(log.heads).toHaveLength(0);

    const on = connect(a, "refuse", { fetch, fallback: {} });
    await expect.poll(() => on.admitted.length).toBe(1);
    expect(log.heads).toHaveLength(1);
  });
});
