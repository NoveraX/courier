import { describe, expect, it, vi } from "vitest";

import { ConfigurationError } from "../src/errors/configuration-error";
import { createMessageQueue, type QueuedMessage } from "../src/realtime/ws/message-queue";

const room = { name: "room" };
const feed = { name: "feed" };

function message(
  payload: unknown,
  owner?: { name: string },
  bytes = 10,
): QueuedMessage<{ name: string }> {
  return { owner, topic: owner?.name ?? "none", payload, bytes };
}

const payloads = (messages: QueuedMessage<unknown>[]) => messages.map((m) => m.payload);

describe("createMessageQueue", () => {
  it("hands each subscription what waits for it, oldest first, and keeps the rest", () => {
    const queue = createMessageQueue<{ name: string }>();
    queue.push(message(1, room));
    queue.push(message(2, feed));
    queue.push(message(3, room));
    queue.push(message(4));

    expect(payloads(queue.take(room))).toEqual([1, 3]);
    expect(payloads(queue.take(undefined))).toEqual([4]);
    expect(queue.size).toBe(1);
    expect(queue.bytes).toBe(10);
  });

  it("holds the connection's subscriptions to one budget together", () => {
    const queue = createMessageQueue<{ name: string }>({ maxCount: 2 });

    expect(queue.push(message(1, room))).toBe(true);
    expect(queue.push(message(2, feed))).toBe(true);
    expect(queue.push(message(3, room))).toBe(false);
    expect(queue.size).toBe(2);
  });

  it("refuses a message past its bytes, and one larger than all of it", () => {
    const queue = createMessageQueue<{ name: string }>({ maxBytes: 25 });

    expect(queue.push(message(1, room, 20))).toBe(true);
    expect(queue.push(message(2, room, 10))).toBe(false);
    expect(
      createMessageQueue({ maxBytes: 25, overflow: "drop-oldest" }).push(message(3, room, 30)),
    ).toBe(false);
  });

  it("drops the oldest for a newer message with drop-oldest, telling of each", () => {
    const onDrop = vi.fn();
    const queue = createMessageQueue<{ name: string }>(
      { maxCount: 2, overflow: "drop-oldest" },
      onDrop,
    );
    queue.push(message(1, room));
    queue.push(message(2, feed));

    expect(queue.push(message(3, room))).toBe(true);
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop.mock.calls[0]?.[0]).toMatchObject({ payload: 1, owner: room });
    expect(payloads(queue.take(room))).toEqual([3]);
  });

  it("moves what waited for one subscription to the one the server took it for", () => {
    const queue = createMessageQueue<{ name: string }>();
    queue.push(message(1, room));
    queue.push(message(2, feed));

    queue.retarget(room, feed);

    expect(payloads(queue.take(feed))).toEqual([1, 2]);
  });

  it("lets go of what an ended subscription kept, saying how much", () => {
    const queue = createMessageQueue<{ name: string }>();
    queue.push(message(1, room));
    queue.push(message(2, room));
    queue.push(message(3, feed));

    expect(queue.forget(room)).toBe(2);
    expect(queue.clear()).toBe(1);
    expect(queue.size).toBe(0);
    expect(queue.bytes).toBe(0);
  });

  it("keeps nothing with a count of 0", () => {
    expect(createMessageQueue({ maxCount: 0 }).push(message(1))).toBe(false);
  });

  it.each([
    [{ maxCount: -1 }, "messageQueue.maxCount is -1"],
    [{ maxCount: 1.5 }, "messageQueue.maxCount is 1.5"],
    [{ maxBytes: Number.POSITIVE_INFINITY }, "messageQueue.maxBytes is Infinity"],
    [{ overflow: "drop-newest" as "reject" }, "messageQueue.overflow is drop-newest"],
  ])("refuses %o, saying which setting", (config, said) => {
    expect(() => createMessageQueue(config)).toThrow(ConfigurationError);
    expect(() => createMessageQueue(config)).toThrow(said);
  });
});
