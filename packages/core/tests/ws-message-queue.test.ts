import { describe, expect, it } from "vitest";
import { createMessageQueue } from "../src/realtime/ws/message-queue";

describe("createMessageQueue", () => {
  it("enqueue and drain returns messages in order", () => {
    const q = createMessageQueue();
    q.enqueue("a");
    q.enqueue("b");
    q.enqueue("c");
    expect(q.drain()).toEqual(["a", "b", "c"]);
  });

  it("drain clears the queue", () => {
    const q = createMessageQueue();
    q.enqueue("x");
    q.drain();
    expect(q.drain()).toEqual([]);
  });

  it("clear empties the queue", () => {
    const q = createMessageQueue();
    q.enqueue("a");
    q.enqueue("b");
    q.clear();
    expect(q.size).toBe(0);
    expect(q.bytes).toBe(0);
    expect(q.drain()).toEqual([]);
  });

  it("size reflects current count", () => {
    const q = createMessageQueue();
    expect(q.size).toBe(0);
    q.enqueue("a");
    expect(q.size).toBe(1);
    q.enqueue("bb");
    expect(q.size).toBe(2);
  });

  it("bytes tracks total string length", () => {
    const q = createMessageQueue();
    q.enqueue("abc"); // 3
    q.enqueue("de"); // 2
    expect(q.bytes).toBe(5);
  });

  it("enqueue returns false when maxCount exceeded", () => {
    const q = createMessageQueue({ maxCount: 2 });
    expect(q.enqueue("a")).toBe(true);
    expect(q.enqueue("b")).toBe(true);
    expect(q.enqueue("c")).toBe(false);
    expect(q.size).toBe(2);
  });

  it("enqueue returns false when maxBytes exceeded", () => {
    const q = createMessageQueue({ maxBytes: 5 });
    expect(q.enqueue("abc")).toBe(true); // 3 bytes
    expect(q.enqueue("xyz")).toBe(false); // 3 + 3 = 6 > 5
    expect(q.size).toBe(1);
    expect(q.bytes).toBe(3);
  });

  it("drain resets size and bytes to 0", () => {
    const q = createMessageQueue();
    q.enqueue("hello");
    q.enqueue("world");
    expect(q.size).toBe(2);
    expect(q.bytes).toBe(10);
    q.drain();
    expect(q.size).toBe(0);
    expect(q.bytes).toBe(0);
  });

  it("empty drain returns empty array", () => {
    const q = createMessageQueue();
    expect(q.drain()).toEqual([]);
  });
});
