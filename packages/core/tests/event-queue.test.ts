/**
 * How the queue behind an SSE subscription ends: finished, failed, or left
 * early by its reader.
 */
import { describe, expect, it, vi } from "vitest";

import { createEventQueue } from "../src/realtime/sse/event-queue";

describe("createEventQueue", () => {
  it("delivers what is buffered, then the failure", async () => {
    const queue = createEventQueue<number>();
    const iterator = queue.iterator();
    queue.push({ data: 1 });

    queue.fail(new Error("stream failed"));

    await expect(iterator.next()).resolves.toEqual({ value: { data: 1 }, done: false });
    await expect(iterator.next()).rejects.toThrow("stream failed");
    await expect(iterator.next()).resolves.toEqual({ value: undefined, done: true });
  });

  it("rejects a reader already waiting when the stream fails", async () => {
    const queue = createEventQueue<number>();
    const waiting = queue.iterator().next();

    queue.fail(new Error("stream failed"));

    await expect(waiting).rejects.toThrow("stream failed");
  });

  it("ignores a failure after the stream finished", async () => {
    const queue = createEventQueue<number>();
    const iterator = queue.iterator();

    queue.finish();
    queue.fail(new Error("too late"));

    await expect(iterator.next()).resolves.toEqual({ value: undefined, done: true });
  });

  it("tells its owner when the reader leaves a for await early", async () => {
    const queue = createEventQueue<number>();
    const onReturn = vi.fn();
    queue.push({ data: 1 });
    queue.push({ data: 2 });

    for await (const _event of queue.iterator(onReturn)) break;

    expect(onReturn).toHaveBeenCalledOnce();
  });

  it("ends for the reader once it has left, buffered events included", async () => {
    const queue = createEventQueue<number>();
    const iterator = queue.iterator();
    queue.push({ data: 1 });

    await iterator.return?.();

    await expect(iterator.next()).resolves.toEqual({ value: undefined, done: true });
  });
});
