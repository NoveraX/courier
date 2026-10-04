/**
 * What a stream's or a channel's implementation must return, checked where
 * it is run. Each was cast to the shape its transport reads and called: a
 * push run as a channel opened, delivered nothing and failed on the first
 * message with `handlers.onMessage is not a function`, and an implementation
 * returning anything else failed as deep inside the transport.
 */
import { describe, expect, it, vi } from "vitest";

import { courier } from "../src/define/courier";
import { channelHandlersOf, eventsOf, sseEventOf } from "../src/realtime/implementation";
import { executeDirectSSE } from "../src/transport/in-process/sse";
import { executeDirectWSChannel } from "../src/transport/in-process/ws-channel";
import { executeDirectWSPush } from "../src/transport/in-process/ws-push";

const { channel, stream } = courier();

function sourcesOf(endpoint: unknown) {
  return { api: { options: { groups: {} }, feed: endpoint } };
}

const push = channel.response<number>().implement(async function* () {
  yield 1;
});

const duplex = channel
  .send<string>()
  .response<string>()
  .implement(() => ({ onMessage: vi.fn() }));

describe("an implementation run where its transport reads it", () => {
  it("is read for events when it returns something to iterate", async () => {
    const events = eventsOf(
      async function* () {
        yield 1;
      },
      {},
      "api.feed",
    );
    const values: unknown[] = [];
    for await (const value of events) values.push(value);

    expect(values).toEqual([1]);
  });

  it("is refused by name when a stream's returns a promise", () => {
    const run = () => eventsOf(async () => 1, {}, "api.feed");

    expect(run).toThrow(/"api\.feed" returned a promise, where a stream's returns what it yields/);
    expect(run).toThrow(expect.objectContaining({ code: "STREAM_IMPLEMENTATION_INVALID" }));
  });

  it("is refused by name when a channel's returns no onMessage", () => {
    const run = () => channelHandlersOf(() => ({ onJoin: vi.fn() }), {}, "api.chat.room");

    expect(run).toThrow(
      /"api\.chat\.room" returned an object, where a channel's returns its handlers/,
    );
  });

  it("reads an SSE event only as an object with text for its name and id", () => {
    expect(sseEventOf({ data: 1, event: "tick", id: "7" }, "api.feed")).toEqual({
      data: 1,
      event: "tick",
      id: "7",
    });
    expect(() => sseEventOf(null, "api.feed")).toThrow(/"api\.feed" yielded null/);
    expect(() => sseEventOf({ data: 1, event: 5 }, "api.feed")).toThrow(/is not an event/);
  });
});

describe("a WS endpoint run in process as the other kind", () => {
  it("is refused when a push is opened as a channel", async () => {
    await expect(
      executeDirectWSChannel(sourcesOf(push), { source: "api", method: "feed" }),
    ).rejects.toThrow(/endpoint is a WS push, not a channel/);
  });

  it("is refused when a channel is subscribed to as a push", async () => {
    await expect(
      executeDirectWSPush(sourcesOf(duplex), { source: "api", method: "feed" }),
    ).rejects.toThrow(/endpoint is a WS channel, not a push/);
  });
});

describe("an implementation run in process that returns the wrong thing", () => {
  it("fails a channel whose implementation returns no handlers when it opens", async () => {
    const room = channel
      .send<string>()
      .response<string>()
      .implement((() => ({})) as never);

    await expect(
      executeDirectWSChannel(sourcesOf(room), { source: "api", method: "feed" }),
    ).rejects.toThrow(/"api\.feed" returned an object, where a channel's returns its handlers/);
  });

  it("fails an SSE stream whose implementation returns no events when it opens", async () => {
    const feed = stream.response<number>().implement((() => 5) as never);

    await expect(
      executeDirectSSE(sourcesOf(feed), { source: "api", method: "feed" }),
    ).rejects.toThrow(expect.objectContaining({ code: "STREAM_IMPLEMENTATION_INVALID" }));
  });

  it("fails an SSE stream at the first value it yields that is not an event", async () => {
    const feed = stream.response<number>().implement(async function* () {
      yield { data: 1 };
      yield null;
    } as never);
    const subscription = await executeDirectSSE(sourcesOf(feed), { source: "api", method: "feed" });
    const received: unknown[] = [];

    await expect(async () => {
      for await (const event of subscription) received.push(event.data);
    }).rejects.toThrow(/"api\.feed" yielded null that is not an event/);
    expect(received).toEqual([1]);
  });
});
