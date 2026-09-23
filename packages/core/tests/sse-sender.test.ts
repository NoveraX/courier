/**
 * What one SSE stream writes, and when it refuses to.
 *
 * Generator events and broadcasts were numbered by two counters that both
 * started at 1, so a client's ids went backwards and `Last-Event-ID` resumed
 * from the wrong place. A broadcast was queued for a client that had stopped
 * reading, reported as delivered, while memory grew without bound.
 */
import { describe, expect, it, vi } from "vitest";

import { LIMITS } from "../src/adapter/limits";
import { createSSESender } from "../src/adapter/sse-sender";

/** A stream whose reader never reads, with the byte-sized queue the handler uses. */
function unreadStream(onSlow = vi.fn()) {
  let sender!: ReturnType<typeof createSSESender>;
  const stream = new ReadableStream<Uint8Array>(
    { start: (controller) => { sender = createSSESender(controller, onSlow); } },
    new ByteLengthQueuingStrategy({ highWaterMark: LIMITS.SSE_MAX_BUFFERED_BYTES }) as QueuingStrategy<Uint8Array>,
  );
  return { stream, sender, onSlow };
}

async function wire(stream: ReadableStream<Uint8Array>, chunks: number): Promise<string> {
  const reader = stream.getReader();
  let text = "";
  for (let i = 0; i < chunks; i += 1) {
    const { value } = await reader.read();
    text += new TextDecoder().decode(value);
  }
  return text;
}

describe("event ids", () => {
  it("run in one sequence for generator events and broadcasts alike", async () => {
    const { stream, sender } = unreadStream();

    sender.send({ data: "gen-1" }, false);
    sender.send({ data: "broadcast-A" }, true);
    sender.send({ data: "gen-2" }, false);

    const ids = [...(await wire(stream, 3)).matchAll(/^id: (\d+)$/gm)].map((m) => m[1]);
    expect(ids).toEqual(["1", "2", "3"]);
  });

  it("use an event's own id when it has one", async () => {
    const { stream, sender } = unreadStream();

    sender.send({ data: "x", id: "custom" }, true);

    expect(await wire(stream, 1)).toContain("id: custom");
  });
});

describe("a client that stops reading", () => {
  it("gets a broadcast refused once its buffer is full, not queued forever", () => {
    const { sender } = unreadStream();
    const big = "x".repeat(LIMITS.SSE_MAX_BUFFERED_BYTES / 2);

    expect(sender.send({ data: big }, true)).not.toBe(false);
    expect(sender.send({ data: big }, true)).toBe(false);
  });

  it("is let go after too many refusals in a row", () => {
    const { sender, onSlow } = unreadStream();
    sender.send({ data: "x".repeat(LIMITS.SSE_MAX_BUFFERED_BYTES) }, true);

    for (let i = 0; i < LIMITS.MAX_CONSECUTIVE_DROPS; i += 1) sender.send({ data: "more" }, true);

    expect(onSlow).toHaveBeenCalled();
  });

  it("still takes any single event into an empty buffer, however large", () => {
    const { sender } = unreadStream();

    expect(sender.send({ data: "x".repeat(LIMITS.SSE_MAX_BUFFERED_BYTES * 2) }, true)).not.toBe(false);
  });
});
