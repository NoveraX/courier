/**
 * What a WebSocket handler's stats() says: the connections it holds and the
 * sockets still being admitted, the topics and subscriptions of this
 * replica, the sockets it closed by the code it closed them with, the
 * frames a full buffer dropped, whether it is stopping, and its pub/sub
 * adapter's own.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWSHandler } from "../src/adapter/handle-ws";
import type { WSHandler, WSHandlerConfig } from "../src/adapter/ws-types";
import { courier } from "../src/define/courier";
import type { Sources } from "../src/define/types";
import { createMemoryBus } from "../src/realtime/memory-bus";
import { qualifyTopic } from "../src/realtime/ws/topic-key";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { authFrame, createFakeSocket, type FakeSocket } from "./helpers/fake-socket";

const { channel } = courier();
const room = channel
  .send<string>()
  .response<string>()
  .implement(() => ({ onMessage: () => undefined }));

const handlers: WSHandler[] = [];

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  registerSources({
    api: { options: { expose: true, groups: { live: { options: {}, room } } } },
  } as Sources);
});

afterEach(async () => {
  await Promise.all(handlers.splice(0).map((handler) => handler.destroy({ timeoutMs: 100 })));
  _resetSourcesForTests();
  vi.restoreAllMocks();
});

function serve(config: WSHandlerConfig = {}): WSHandler {
  const handler = createWSHandler({ heartbeatIntervalMs: 60_000, ...config });
  handlers.push(handler);
  return handler;
}

function open(handler: WSHandler, userId: string, url = "http://localhost/api/ws"): FakeSocket {
  const socket = createFakeSocket();
  handler.handleSocket(socket, new Request(url), "203.0.113.7");
  socket.receive(authFrame({ auth: { userId } }));
  return socket;
}

describe("WSHandler.stats()", () => {
  it("counts the connections it holds, and apart from them a socket still being admitted", async () => {
    let admitSlow: () => void = () => undefined;
    const handler = serve({
      onConnect: ({ auth }) =>
        auth?.userId === "slow"
          ? new Promise((resolve) => {
              admitSlow = () => resolve({ userId: "slow" });
            })
          : { userId: auth?.userId },
    });

    open(handler, "fast");
    open(handler, "slow");

    await expect.poll(() => handler.stats()).toMatchObject({ connections: 1, admitting: 1 });
    admitSlow();
    await expect.poll(() => handler.stats()).toMatchObject({ connections: 2, admitting: 0 });
  });

  it("counts the topics subscribed on this replica and the subscriptions to them", async () => {
    const handler = serve({ onConnect: ({ auth }) => ({ userId: auth?.userId }) });
    const [first, second] = [open(handler, "u1"), open(handler, "u2")];
    await expect.poll(() => handler.stats().connections).toBe(2);

    first.receive({
      type: "subscribe",
      id: "s1",
      topic: qualifyTopic("api.live.room", { room: "a" }),
      payload: { room: "a" },
    });
    second.receive({
      type: "subscribe",
      id: "s2",
      topic: qualifyTopic("api.live.room", { room: "a" }),
      payload: { room: "a" },
    });
    second.receive({
      type: "subscribe",
      id: "s3",
      topic: qualifyTopic("api.live.room", { room: "b" }),
      payload: { room: "b" },
    });

    await expect.poll(() => handler.stats()).toMatchObject({ topics: 2, subscriptions: 3 });
  });

  it("counts the sockets it closed by the code it closed them with", async () => {
    const handler = serve({
      allowedHosts: ["localhost"],
      onConnect: ({ auth }) => ({ userId: auth?.userId }),
    });
    open(handler, "u1", "http://evil.example/api/ws");
    open(handler, "u1", "http://evil.example/api/ws");
    open(handler, "u2");
    await expect.poll(() => handler.stats().connections).toBe(1);

    await handler.connections.disconnect({ meta: { userId: "u2" } }, { code: 4001 });

    expect(handler.stats().closed).toEqual({ "4421": 2, "4001": 1 });
  });

  it("counts the frames a full buffer dropped, before the application's own hook hears of each", async () => {
    const onMessageDrop = vi.fn();
    const handler = serve({ maxBufferedAmount: 1_024, onMessageDrop });
    const socket = open(handler, "u1");
    await expect.poll(() => handler.stats().connections).toBe(1);
    Object.defineProperty(socket, "bufferedAmount", { value: 4_096 });

    await handler.connections.broadcast("first");
    await handler.connections.broadcast("second");

    expect(handler.stats().droppedFrames).toBe(2);
    expect(onMessageDrop).toHaveBeenCalledTimes(2);
  });

  it("says when it is stopping, and passes its pub/sub adapter's own on", async () => {
    const pubsub = createMemoryBus().replica("replica");
    const handler = serve({ pubsub });

    expect(handler.stats()).toMatchObject({ stopping: false, pubsub: { state: pubsub.state } });
    const stopped = handler.destroy();
    expect(handler.stats().stopping).toBe(true);
    await stopped;
  });
});
