/**
 * A reader that falls behind its stream: the oldest buffered events are
 * dropped and counted, the stream carries only what the server sent, and the
 * log says so once per stretch rather than once per event.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEventQueue, DEFAULT_MAX_BUFFER_SIZE } from "../src/realtime/sse/event-queue";

afterEach(() => vi.restoreAllMocks());

async function drain(queue: ReturnType<typeof createEventQueue<string>>): Promise<string[]> {
  const iter = queue.iterator();
  const read: string[] = [];
  while (queue.size > 0) {
    const { value } = await iter.next();
    if (value) read.push(value.data);
  }
  return read;
}

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

  it("drops the oldest events when the buffer is full, and counts them", async () => {
    const queue = createEventQueue<string>(3);
    for (const data of ["a", "b", "c", "d", "e"]) queue.push({ data });

    expect(queue.dropped).toBe(2);
    expect(await drain(queue)).toEqual(["c", "d", "e"]);
  });

  it("adds nothing of its own to the stream", async () => {
    const queue = createEventQueue<string>(2);
    for (const data of ["a", "b", "c"]) queue.push({ data });

    const iter = queue.iterator();
    const events = [(await iter.next()).value, (await iter.next()).value];

    expect(events.map((e) => e?.event)).toEqual([undefined, undefined]);
    expect(events.map((e) => e?.data)).toEqual(["b", "c"]);
  });

  it("warns once when the reader falls behind, and once with the total when it catches up", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const queue = createEventQueue<string>(2);

    for (let i = 0; i < 1000; i++) queue.push({ data: String(i) });
    await drain(queue);

    const lines = warn.mock.calls.map((call) => call.slice(1).join(" "));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("faster than they are read");
    expect(lines[1]).toContain("Dropped 998 event(s)");
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
});
