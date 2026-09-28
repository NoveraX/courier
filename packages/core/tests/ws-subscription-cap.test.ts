/**
 * `maxSubscriptionsPerConnection` against a burst.
 *
 * The cap was read when a subscribe arrived, and the subscription was
 * counted only once validation, middleware and authorization had run —
 * several awaits later. Every frame of a burst saw the count as it was
 * before the burst, so one socket could open 500 subscriptions under a cap
 * of 5, each with a live handler behind it.
 */
import { afterEach, describe, expect, it } from "vitest";

import { createWSHandler } from "../src/adapter/handle-ws";
import { courier } from "../src/define/courier";
import type { Sources } from "../src/define/types";
import type { WebSocketLike } from "../src/realtime/adapters";
import { decodeMessage, encodeMessage, type WSMessage } from "../src/realtime/ws/ws-protocol";
import { _resetSourcesForTests, registerSources } from "../src/sources";

const { channel } = courier();
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

afterEach(() => {
  _resetSourcesForTests();
});

type Socket = WebSocketLike & { emit(type: string, event?: unknown): void; sent: WSMessage[] };

function createSocket(): Socket {
  const listeners = new Map<string, Array<(event: unknown) => void>>();
  const socket: Socket = {
    readyState: 1,
    bufferedAmount: 0,
    sent: [],
    send(data) {
      socket.sent.push(decodeMessage(data));
    },
    close: () => undefined,
    addEventListener(type: string, handler: (event: never) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), handler as (event: unknown) => void]);
    },
    emit(type, event) {
      for (const handler of listeners.get(type) ?? []) handler(event);
    },
  };
  return socket;
}

function serve(maxSubscriptionsPerConnection: number): { socket: Socket; live: () => number } {
  let live = 0;
  const feed = channel.response<string>().implement((async function* () {
    live += 1;
    yield "hello";
    await new Promise(() => {});
  }) as never);
  registerSources({ api: { options: { groups: { live: { options: {}, feed } } } } } as Sources);
  const socket = createSocket();
  createWSHandler({ maxSubscriptionsPerConnection }).handleSocket(
    socket,
    new Request("http://localhost/api/ws"),
  );
  return { socket, live: () => live };
}

function subscribe(socket: Socket, topic: string): void {
  socket.emit("message", { data: encodeMessage({ type: "subscribe", id: topic, topic }) });
}

describe("maxSubscriptionsPerConnection", () => {
  it("holds against a burst sent in one turn", async () => {
    const { socket, live } = serve(5);

    for (let i = 0; i < 50; i += 1) subscribe(socket, `api.live.feed#${i}`);
    await settle();

    expect(socket.sent.filter((m) => m.type === "subscribed")).toHaveLength(5);
    expect(live()).toBe(5);
    /* Past the cap, a subscription is refused by it or, once the burst
       outruns twice the cap, by the limit on subscribe frames. */
    const refused = socket.sent.filter((m) => m.error?.code === 4429);
    expect(refused).toHaveLength(45);
  });

  it("frees the place of a subscription that failed on its way in", async () => {
    const { socket } = serve(1);

    subscribe(socket, "api.nothing.here");
    await settle();
    subscribe(socket, "api.live.feed#1");
    await settle();

    expect(socket.sent.filter((m) => m.type === "subscribed")).toHaveLength(1);
  });

  it("does not count renewing a subscription the connection already holds", async () => {
    const { socket } = serve(1);

    subscribe(socket, "api.live.feed");
    await settle();
    subscribe(socket, "api.live.feed");
    await settle();

    expect(socket.sent.filter((m) => m.type === "subscribed")).toHaveLength(2);
  });
});
