import type { SSEEvent, SSESubscription } from "@noverax/courier/realtime";
import { describe, expect, it } from "vitest";
import { createMockClient } from "../src/create-mock-client";

/** Collect all events from an SSE subscription */
async function collect<T>(sub: SSESubscription<T>): Promise<SSEEvent<T>[]> {
  const events: SSEEvent<T>[] = [];
  for await (const event of sub) events.push(event);
  return events;
}

describe("mock client — SSE .stream()", () => {
  it("returns SSESubscription from async generator", async () => {
    const { client, mock } = createMockClient();

    mock("notifications", "feed").stream(async function* () {
      yield { data: { text: "hello" }, id: "1" };
      yield { data: { text: "world" }, id: "2" };
    });

    const sub = (client as any).notifications.feed() as SSESubscription<{ text: string }>;
    const events = await collect(sub);

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ data: { text: "hello" }, id: "1" });
    expect(events[1]).toEqual({ data: { text: "world" }, id: "2" });
  });

  it("supports named event types", async () => {
    const { client, mock } = createMockClient();

    mock("chat", "messages").stream(async function* () {
      yield { data: { msg: "hi" }, event: "message" };
      yield { data: { user: "alice" }, event: "join" };
    });

    const sub = (client as any).chat.messages() as SSESubscription<unknown>;
    const events = await collect(sub);

    expect(events[0]?.event).toBe("message");
    expect(events[1]?.event).toBe("join");
  });

  it("records stream request in history", async () => {
    const { client, mock, history } = createMockClient();

    mock("notifications", "feed").stream(async function* () {
      yield { data: "event1" };
    });

    const sub = (client as any).notifications.feed() as SSESubscription<string>;
    await collect(sub);

    expect(history).toHaveLength(1);
    expect(history[0]?.stream).toBe(true);
    expect(history[0]?.group).toBe("notifications");
    expect(history[0]?.method).toBe("feed");
  });

  it("passes variables to stream generator via context", async () => {
    const { client, mock } = createMockClient();
    let receivedVars: unknown;

    mock("chat", "room").stream(async function* (ctx) {
      receivedVars = ctx.variables;
      yield { data: "ok" };
    });

    const sub = (client as any).chat.room({ roomId: "42" }) as SSESubscription<string>;
    await collect(sub);

    expect(receivedVars).toEqual({ roomId: "42" });
  });

  it("supports .delay() before stream starts", async () => {
    const { client, mock } = createMockClient();

    mock("notifications", "feed")
      .stream(async function* () {
        yield { data: "delayed" };
      })
      .delay(50);

    const start = Date.now();
    const sub = (client as any).notifications.feed() as SSESubscription<string>;
    await collect(sub);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(40);
  });

  it("empty generator produces no events", async () => {
    const { client, mock } = createMockClient();

    mock("notifications", "feed").stream(async function* () {
      // empty
    });

    const sub = (client as any).notifications.feed() as SSESubscription<string>;
    const events = await collect(sub);

    expect(events).toHaveLength(0);
  });
});

describe("mock client — SSE .emits()", () => {
  it("emits fixed events in sequence", async () => {
    const { client, mock } = createMockClient();

    mock("alerts", "stream").emits([
      { data: "first", id: "1" },
      { data: "second", id: "2" },
      { data: "third", id: "3" },
    ]);

    const sub = (client as any).alerts.stream() as SSESubscription<string>;
    const events = await collect(sub);

    expect(events).toHaveLength(3);
    expect(events.map((e) => e.data)).toEqual(["first", "second", "third"]);
    expect(events.map((e) => e.id)).toEqual(["1", "2", "3"]);
  });

  it("emits events with named event types", async () => {
    const { client, mock } = createMockClient();

    mock("metrics", "live").emits([
      { data: { cpu: 42 }, event: "cpu" },
      { data: { mem: 80 }, event: "memory" },
    ]);

    const sub = (client as any).metrics.live() as SSESubscription<unknown>;
    const events = await collect(sub);

    expect(events[0]).toEqual({ data: { cpu: 42 }, event: "cpu" });
    expect(events[1]).toEqual({ data: { mem: 80 }, event: "memory" });
  });
});

describe("mock client — SSE lifecycle", () => {
  it("subscription status transitions correctly", async () => {
    const { client, mock } = createMockClient();
    const statuses: string[] = [];

    mock("feed", "live").stream(async function* () {
      yield { data: "event" };
    });

    const sub = (client as any).feed.live() as SSESubscription<string>;
    sub.on("status", (s) => statuses.push(s));

    await collect(sub);

    expect(statuses).toContain("connecting");
    expect(statuses).toContain("connected");
    expect(statuses).toContain("disconnected");
  });

  it("close() terminates the stream early", async () => {
    const { client, mock } = createMockClient();
    let yielded = 0;

    mock("feed", "live").stream(async function* () {
      for (let i = 0; i < 100; i++) {
        yielded++;
        yield { data: i };
        // Small delay to allow close() to take effect
        await new Promise((r) => setTimeout(r, 1));
      }
    });

    const sub = (client as any).feed.live() as SSESubscription<number>;
    const events: SSEEvent<number>[] = [];

    for await (const event of sub) {
      events.push(event);
      if (events.length >= 3) sub.close();
    }

    expect(events.length).toBeGreaterThanOrEqual(3);
    expect(events.length).toBeLessThan(100);
    await new Promise((r) => setTimeout(r, 20));
    expect(yielded).toBeLessThan(10);
  });

  it("resetMocks clears SSE mocks", async () => {
    const { client, mock, resetMocks } = createMockClient();

    mock("feed", "live").stream(async function* () {
      yield { data: "ok" };
    });

    resetMocks();

    await expect(
      (async () => {
        const sub = (client as any).feed.live();
        if (sub && typeof sub[Symbol.asyncIterator] === "function") {
          for await (const _ of sub) {
            /* noop */
          }
        }
        return sub;
      })(),
    ).rejects.toThrow("[courier-mock] No mock");
  });
});
