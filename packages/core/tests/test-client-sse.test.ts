import { afterEach, describe, expect, it } from "vitest";
import type { SSEEvent, SSESubscription } from "../src/realtime/types";
import { createTestClient } from "../src/testing/index";

const testClient = createTestClient();
const { client, mock, history } = testClient;

afterEach(() => {
  testClient.reset();
});

/** Collect all events from an SSE subscription */
async function collect<T>(sub: SSESubscription<T>): Promise<SSEEvent<T>[]> {
  const events: SSEEvent<T>[] = [];
  for await (const event of sub) {
    events.push(event);
  }
  return events;
}

describe("test client — SSE stream mocks", () => {
  describe("basic stream", () => {
    it("yields events from async generator", async () => {
      mock("notifications", "feed").stream(async function* () {
        yield { data: { text: "hello" }, id: "1" };
        yield { data: { text: "world" }, id: "2" };
      });

      const sub = (client as any).notifications.feed() as SSESubscription<{ text: string }>;
      const events = await collect(sub);

      expect(events).toEqual([
        { data: { text: "hello" }, id: "1" },
        { data: { text: "world" }, id: "2" },
      ]);
    });

    it("supports named event types", async () => {
      mock("chat", "messages").stream(async function* () {
        yield { data: { user: "Alice" }, event: "join" };
        yield { data: { text: "hi" }, event: "message", id: "1" };
      });

      const sub = (client as any).chat.messages() as SSESubscription<unknown>;
      const events = await collect(sub);

      expect(events[0]?.event).toBe("join");
      expect(events[1]?.event).toBe("message");
    });

    it("returns empty when generator yields nothing", async () => {
      mock("feed", "empty").stream(async function* () {
        // no events
      });

      const sub = (client as any).feed.empty() as SSESubscription<unknown>;
      const events = await collect(sub);

      expect(events).toEqual([]);
    });
  });

  describe("lifecycle & status", () => {
    it("transitions through connecting → connected → disconnected", async () => {
      const statuses: string[] = [];

      mock("feed", "live").stream(async function* () {
        yield { data: "ok" };
      });

      const sub = (client as any).feed.live() as SSESubscription<string>;
      sub.on("status", (s) => statuses.push(s));

      await collect(sub);

      expect(statuses).toContain("connecting");
      expect(statuses).toContain("connected");
      expect(statuses).toContain("disconnected");
    });

    it("status is disconnected after stream ends", async () => {
      mock("feed", "live").stream(async function* () {
        yield { data: "one" };
      });

      const sub = (client as any).feed.live() as SSESubscription<string>;
      await collect(sub);

      expect(sub.status).toBe("disconnected");
    });

    it("close() terminates stream early", async () => {
      let yielded = 0;

      mock("feed", "infinite").stream(async function* () {
        for (let i = 0; i < 100; i++) {
          yield { data: i };
          yielded++;
        }
      });

      const sub = (client as any).feed.infinite() as SSESubscription<number>;
      const events: SSEEvent<number>[] = [];

      for await (const event of sub) {
        events.push(event);
        if (events.length === 3) {
          sub.close();
        }
      }

      // Allow runStream cleanup to finish (async finally block)
      await new Promise((r) => setTimeout(r, 0));

      expect(events).toHaveLength(3);
      expect(yielded).toBeLessThan(100);
      expect(sub.status).toBe("disconnected");
    });
  });

  describe("history tracking", () => {
    it("records stream request in history with stream flag", async () => {
      mock("feed", "live").stream(async function* () {
        yield { data: "event" };
      });

      const sub = (client as any).feed.live() as SSESubscription<string>;
      await collect(sub);

      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        group: "feed",
        method: "live",
        stream: true,
      });
    });

    it("records variables in history", async () => {
      mock("feed", "live").stream(async function* () {
        yield { data: "event" };
      });

      const sub = (client as any).feed.live({ userId: "42" }) as SSESubscription<string>;
      await collect(sub);

      expect(history[0]?.variables).toEqual({ userId: "42" });
    });
  });

  describe("mock lifetime", () => {
    it(".once() limits stream mock to single use", async () => {
      // Persistent mock pushed first (bottom of stack)
      mock("feed", "live").stream(async function* () {
        yield { data: "fallback" };
      });

      // .once() mock pushed last (top of LIFO stack — consumed first)
      mock("feed", "live")
        .stream(async function* () {
          yield { data: "first" };
        })
        .once();

      // First call uses .once() mock (LIFO: top of stack)
      const sub1 = (client as any).feed.live() as SSESubscription<string>;
      const events1 = await collect(sub1);
      expect(events1[0]?.data).toBe("first");

      // Second call falls through to persistent mock
      const sub2 = (client as any).feed.live() as SSESubscription<string>;
      const events2 = await collect(sub2);
      expect(events2[0]?.data).toBe("fallback");
    });
  });

  describe("delay", () => {
    it("delays stream start", async () => {
      mock("feed", "live")
        .stream(async function* () {
          yield { data: "delayed" };
        })
        .delay(50);

      const start = Date.now();
      const sub = (client as any).feed.live() as SSESubscription<string>;
      await collect(sub);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(40);
    });
  });

  describe("reset", () => {
    it("reset clears stream mocks", async () => {
      mock("feed", "live").stream(async function* () {
        yield { data: "event" };
      });

      testClient.resetMocks();

      // After reset, unmocked calls go through async HTTP path → rejected Promise
      await expect((client as any).feed.live()).rejects.toThrow(/No mock/);
    });
  });
});
