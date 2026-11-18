/**
 * The HTTP transport across replicas that share a pub/sub adapter and no
 * affinity, as behind an entry that sends each request to the next replica:
 * a request that reaches a replica other than its connection's holder is
 * sent on to the holder alone and answered from there. The client's frames
 * are taken there once, a poll is held there, and a stream that lands
 * elsewhere is answered with the holder's poll, marked relayed. With the
 * cluster's secret a forged token goes no further than the replica it
 * reached, and a holder that does not answer is told to the client in time.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWSHandler } from "../src/adapter/handle-ws";
import type { WSHandler, WSHandlerConfig } from "../src/adapter/ws-types";
import type { PubSubAdapter } from "../src/realtime/adapters";
import { createMemoryBus } from "../src/realtime/memory-bus";
import { _resetSourcesForTests, registerSources } from "../src/server/sources";
import { authFrame } from "./helpers/fake-socket";
import { eventsOf, messageOf, openOverHTTP, post } from "./helpers/http-client";

const SECRET = "a-cluster-secret-of-32-bytes-or-more";
const handlers: WSHandler[] = [];

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  registerSources({});
});

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(handlers.splice(0).map((handler) => handler.destroy({ timeoutMs: 100 })));
  _resetSourcesForTests();
  vi.restoreAllMocks();
});

function replica(pubsub: PubSubAdapter, config: WSHandlerConfig = {}): WSHandler {
  const handler = createWSHandler({ pubsub, heartbeatIntervalMs: 60_000, ...config });
  handlers.push(handler);
  return handler;
}

function idOf(handler: WSHandler): string {
  return handler.connections.list()[0]?.connectionId ?? "";
}

describe("the HTTP transport on replicas with no affinity", () => {
  it("sends a request on to the replica that holds its connection, and answers what that one answered", async () => {
    const bus = createMemoryBus();
    const [a, b] = [replica(bus.replica("a")), replica(bus.replica("b"))];
    const { token, events } = await openOverHTTP(a, "poll", [authFrame()]);
    await events.rest();

    const sent = await post(b, { op: "send", token, seq: 2, ack: 1 }, [{ type: "ping" }]);
    const polled = await eventsOf(await post(b, { op: "poll", token, ack: 1 })).rest();

    expect(sent.status).toBe(204);
    expect(polled.map((event) => [event.id, messageOf(event).type])).toEqual([["2", "pong"]]);
    expect([a.stats().http?.connections, b.stats().http?.connections]).toEqual([1, 0]);
    expect(b.stats().http?.forwarded).toBe(2);
  });

  it("holds a poll on the holder until it sends a frame, and answers a stream that landed elsewhere with the holder's poll", async () => {
    const bus = createMemoryBus();
    const [a, b] = [replica(bus.replica("a")), replica(bus.replica("b"))];
    const { token, events } = await openOverHTTP(a, "poll", [authFrame()]);
    await events.rest();

    const polled = post(b, { op: "poll", token, ack: 1 });
    await expect.poll(() => a.stats().http?.polling).toBe(1);
    a.connections.send(idOf(a), "news");
    const carried = await eventsOf(await polled).rest();
    const streamed = eventsOf(await post(b, { op: "stream", token, ack: 2 }));
    const relayed = await streamed.next();
    a.connections.send(idOf(a), "more");

    expect(carried.map((event) => event.id)).toEqual(["2"]);
    expect(relayed?.event).toBe("relayed");
    expect((await streamed.rest()).map((event) => event.id)).toEqual(["3"]);
  });

  it("refuses, with the cluster's secret, a token it does not vouch for, sending it on to nobody", async () => {
    const bus = createMemoryBus();
    const secured = { cluster: { secret: SECRET } };
    const [a, b] = [replica(bus.replica("a"), secured), replica(bus.replica("b"), secured)];
    const { token, events } = await openOverHTTP(a, "poll", [authFrame()]);
    await events.rest();
    const forged = `${token.slice(0, -1)}${token.endsWith("0") ? "1" : "0"}`;

    const statuses = await Promise.all(
      [forged, token.slice(0, 49)].map(async (named) => {
        return (await post(b, { op: "poll", token: named, ack: 1 })).status;
      }),
    );
    const vouched = await post(b, { op: "send", token, seq: 2, ack: 1 }, [{ type: "ping" }]);

    expect(token).toMatch(/^[0-9a-f]{16}\.[0-9a-f]{32}\.[0-9a-f]{32}$/);
    expect(statuses).toEqual([410, 410]);
    expect(vouched.status).toBe(204);
    expect(b.stats().http?.forwarded).toBe(1);
  });

  it("tells its client the holder is out of reach once no answer has come in time", async () => {
    const bus = createMemoryBus();
    const b = replica(bus.replica("b"));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const answering = post(b, { op: "send", token: `${"0".repeat(16)}.${"1".repeat(32)}`, seq: 1 });
    await vi.advanceTimersByTimeAsync(5_000);
    const answer = await answering;

    expect(answer.status).toBe(504);
    expect(await answer.json()).toMatchObject({ code: "HOLDER_UNREACHABLE" });
  });
});
