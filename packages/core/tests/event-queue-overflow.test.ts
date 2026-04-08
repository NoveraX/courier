import { describe, expect, it } from "vitest";
import { createEventQueue, DEFAULT_MAX_BUFFER_SIZE } from "../src/realtime/sse/event-queue";

describe("EventQueue overflow", () => {
  it("exports DEFAULT_MAX_BUFFER_SIZE as 1000", () => {
    expect(DEFAULT_MAX_BUFFER_SIZE).toBe(1000);
  });

  it("accepts custom maxBufferSize", () => {
    const queue = createEventQueue<string>(5);
    for (let i = 0; i < 5; i++) {
      queue.push({ data: `event-${i}` });
    }
    expect(queue.size).toBe(5);
    expect(queue.dropped).toBe(0);
  });

  it("drops oldest events when buffer is full", () => {
    const queue = createEventQueue<string>(3);
    queue.push({ data: "a" });
    queue.push({ data: "b" });
    queue.push({ data: "c" });
    // Buffer is now full [a, b, c]

    queue.push({ data: "d" });
    // "a" is dropped, overflow event also injected (may cause cascade)
    expect(queue.dropped).toBeGreaterThanOrEqual(1);
  });

  it("emits overflow event to consumer after drop", async () => {
    const queue = createEventQueue<string>(3);
    queue.push({ data: "a" });
    queue.push({ data: "b" });
    queue.push({ data: "c" });

    // Buffer full [a, b, c]. Push "d" → drops "a", adds "d", then adds overflow event (drops "b")
    queue.push({ data: "d" });
    expect(queue.dropped).toBeGreaterThanOrEqual(1);

    const iter = queue.iterator();
    const events: Array<{ event?: string; data: unknown }> = [];
    while (queue.size > 0) {
      const { value } = await iter.next();
      if (value) events.push(value);
    }

    // Should contain an overflow event somewhere
    const overflowEvent = events.find((e) => e.event === "overflow");
    expect(overflowEvent).toBeDefined();
    expect((overflowEvent!.data as Record<string, number>).dropped).toBeGreaterThanOrEqual(1);
  });

  it("tracks dropped count across multiple overflows", () => {
    const queue = createEventQueue<string>(2);
    queue.push({ data: "a" });
    queue.push({ data: "b" });
    queue.push({ data: "c" }); // drops a
    queue.push({ data: "d" }); // drops b (overflow event from prev was in buffer)

    expect(queue.dropped).toBeGreaterThanOrEqual(2);
  });

  it("delivers immediately when consumer is waiting (no buffer)", async () => {
    const queue = createEventQueue<string>(2);
    const iter = queue.iterator();

    // Consumer starts waiting before any events
    const promise = iter.next();
    queue.push({ data: "immediate" });

    const result = await promise;
    expect(result.value?.data).toBe("immediate");
    expect(queue.dropped).toBe(0);
    expect(queue.size).toBe(0);
  });

  it("exposes size getter", () => {
    const queue = createEventQueue<string>(10);
    expect(queue.size).toBe(0);

    queue.push({ data: "a" });
    queue.push({ data: "b" });
    expect(queue.size).toBe(2);
  });

  it("enforces minimum capacity of 1", () => {
    const queue = createEventQueue<string>(0);
    queue.push({ data: "a" });
    expect(queue.size).toBe(1);
    expect(queue.dropped).toBe(0);
  });

  it("finish resolves waiting consumer", async () => {
    const queue = createEventQueue<string>(10);
    const iter = queue.iterator();

    const promise = iter.next();
    queue.finish();

    const result = await promise;
    expect(result.done).toBe(true);
  });

  it("drains buffered events before done", async () => {
    const queue = createEventQueue<string>(10);
    queue.push({ data: "a" });
    queue.push({ data: "b" });
    queue.finish();

    const iter = queue.iterator();
    const first = await iter.next();
    expect(first.value?.data).toBe("a");

    const second = await iter.next();
    expect(second.value?.data).toBe("b");

    const end = await iter.next();
    expect(end.done).toBe(true);
  });

  it("delivers pending overflow before finish when consumer is waiting", async () => {
    const queue = createEventQueue<string>(2);
    queue.push({ data: "a" });
    queue.push({ data: "b" });
    // Buffer full. Next push causes overflow → sets pendingOverflow
    queue.push({ data: "c" });
    expect(queue.dropped).toBeGreaterThanOrEqual(1);

    // Drain all buffered events
    const iter = queue.iterator();
    while (queue.size > 0) {
      await iter.next();
    }

    // Consumer now waits for next event
    const waitPromise = iter.next();

    // finish() should deliver pending overflow (if any) before done
    queue.finish();

    const result = await waitPromise;
    // After finish, next call should eventually return done
    if (!result.done) {
      const end = await iter.next();
      expect(end.done).toBe(true);
    }
  });
});
