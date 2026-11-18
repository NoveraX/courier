/**
 * A connection carried over HTTP comes back to a WebSocket once one gets
 * through again: its probe answered, the connection is made anew on a
 * WebSocket and its topic resumed where it stood from the topic's history,
 * nothing lost and nothing twice, the server holding the one connection
 * after — an event published at any ms of the way back, the one its
 * WebSocket is admitted in included. One whose WebSocket still does not get
 * through stays on HTTP, each probe let go of before the server admitted it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWSHandler } from "../src/adapter/handle-ws";
import type { WSHandler, WSHandlerConfig } from "../src/adapter/ws-types";
import { defineApi } from "../src/define/api";
import { courier } from "../src/define/courier";
import { defineGroup } from "../src/define/group";
import type { WSTransport } from "../src/realtime/ws/connection-machine-types";
import { createWSConnection } from "../src/realtime/ws/ws-connection";
import type { TopicOpenInfo, WSConnection } from "../src/realtime/ws/ws-types";
import { _resetSourcesForTests, registerSources } from "../src/server/sources";
import { entryTo } from "./helpers/http-entry";
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
  vi.useFakeTimers();
  registerSources({ api } as never);
});

afterEach(async () => {
  for (const connection of connections.splice(0)) connection.close();
  vi.useRealTimers();
  await Promise.all(handlers.splice(0).map((handler) => handler.destroy({ timeoutMs: 100 })));
  _resetSourcesForTests();
  vi.restoreAllMocks();
});

/** A server keeping its topics' recent events, and the connections it admitted and ended. */
function serve(config: WSHandlerConfig = {}) {
  const admitted: string[] = [];
  const ended: number[] = [];
  const handler = createWSHandler({
    heartbeatIntervalMs: 600_000,
    history: {},
    onConnect: ({ connectionId }) => void admitted.push(connectionId),
    onDisconnect: ({ code }) => void ended.push(code),
    ...config,
  });
  handlers.push(handler);
  return { handler, admitted, ended };
}

/** A connection subscribed to the room, over HTTP once its WebSocket went `way`. */
function connect(handler: WSHandler, way: SocketWay) {
  const sockets = socketsTo(handler, way);
  const { fetch, log } = entryTo([handler]);
  const connection = createWSConnection({
    url: `ws://place-${++places}.localhost/api/ws`,
    socketFactory: sockets.factory,
    fallback: { after: 100 },
    backoff: FAST,
    fetch,
  });
  connections.push(connection);
  const heard: string[] = [];
  const opens: TopicOpenInfo[] = [];
  connection.subscribe(TOPIC, {
    data: (payload) => heard.push(String(payload)),
    open: (info) => opens.push(info),
  });
  return { connection, sockets, heard, opens, log };
}

function transportOf(connection: WSConnection): WSTransport | undefined {
  const { state } = connection;
  return state.phase === "open" ? state.transport : undefined;
}

describe("a connection carried over HTTP", () => {
  it("comes back to a WebSocket within 30 s of one getting through, its topic resumed where it stood", async () => {
    const { handler, admitted, ended } = serve();
    const { connection, sockets, heard, opens } = connect(handler, "refuse");
    await vi.waitFor(() => expect(opens).toHaveLength(1));
    expect(transportOf(connection)).toBe("stream");

    sockets.way = "pass";
    let sent = 0;
    for (let tick = 0; tick < 310 && transportOf(connection) !== "websocket"; tick++) {
      await handler.connections.broadcastToTopic(TOPIC, `m${++sent}`);
      await vi.advanceTimersByTimeAsync(100);
    }
    for (let more = 0; more < 5; more++) {
      await handler.connections.broadcastToTopic(TOPIC, `m${++sent}`);
      await vi.advanceTimersByTimeAsync(10);
    }
    await vi.waitFor(() => expect(heard).toHaveLength(sent));

    expect(transportOf(connection)).toBe("websocket");
    expect(sent).toBeLessThanOrEqual(305);
    expect(heard).toEqual(Array.from({ length: sent }, (_, n) => `m${n + 1}`));
    expect(opens.at(-1)).toEqual({ resumed: true });
    expect(sockets.opened()).toBe(3);
    expect(admitted).toHaveLength(2);
    expect(ended).toEqual([4000]);
    expect(handler.connections.count).toBe(1);
  });

  it("hears each event of its topic once and in order on the way back, one published at every ms of it", async () => {
    /* At 0, the probe's draw sends it 15 s after the connection opened over HTTP. */
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { handler, admitted, ended } = serve();
    const { connection, sockets, heard, opens } = connect(handler, "refuse");
    await vi.waitFor(() => expect(opens).toHaveLength(1));
    sockets.way = "pass";
    await vi.advanceTimersByTimeAsync(13_900);
    expect(sockets.opened()).toBe(1);

    let sent = 0;
    for (let ms = 0; ms < 1200 && transportOf(connection) !== "websocket"; ms++) {
      await handler.connections.broadcastToTopic(TOPIC, `m${++sent}`);
      await vi.advanceTimersByTimeAsync(1);
    }
    await handler.connections.broadcastToTopic(TOPIC, `m${++sent}`);
    await vi.waitFor(() => expect(heard).toHaveLength(sent));

    expect(transportOf(connection)).toBe("websocket");
    expect(heard).toEqual(Array.from({ length: sent }, (_, n) => `m${n + 1}`));
    expect(sockets.opened()).toBe(3);
    expect(admitted).toHaveLength(2);
    expect(ended).toEqual([4000]);
    expect(handler.connections.count).toBe(1);
  });

  it("stays on HTTP while its WebSocket's frames are still held back, each probe let go of unadmitted", async () => {
    const { handler, admitted, ended } = serve();
    const { connection, sockets, heard, opens, log } = connect(handler, "silent");
    await vi.waitFor(() => expect(opens).toHaveLength(1));
    /* The WebSocket the server admitted but could not answer on, let go of for HTTP. */
    await vi.waitFor(() => expect(ended).toEqual([4100]));
    expect(admitted).toHaveLength(2);
    const requests = log.heads.length;

    await vi.advanceTimersByTimeAsync(90_200);
    await handler.connections.broadcastToTopic(TOPIC, "still here");
    await vi.waitFor(() => expect(heard).toEqual(["still here"]));

    expect(transportOf(connection)).toBe("stream");
    expect(sockets.opened()).toBe(3);
    expect(admitted).toHaveLength(2);
    expect(ended).toEqual([4100]);
    expect(handler.connections.count).toBe(1);
    expect(log.heads.slice(requests).filter((head) => head.token === undefined)).toEqual([]);
  });
});
