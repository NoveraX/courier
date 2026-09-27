/**
 * What one SSE stream writes, and when it refuses to.
 *
 * Generator events and broadcasts were numbered by two counters that both
 * started at 1, so a client's ids went backwards and `Last-Event-ID` resumed
 * from the wrong place; numbered from one counter, a broadcast into a stream
 * whose endpoint names its ids still moved the client's resume point to a
 * number the endpoint knew nothing of. A broadcast was queued for a client
 * that had stopped reading, reported as delivered, while memory grew without
 * bound.
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
  it("number the generator's events in one sequence a broadcast leaves alone", async () => {
    const { stream, sender } = unreadStream();

    sender.send({ data: "gen-1" });
    sender.broadcast({ data: "broadcast-A" });
    sender.send({ data: "gen-2" });

    const ids = [...(await wire(stream, 3)).matchAll(/^id: (.+)$/gm)].map((m) => m[1]);
    expect(ids).toEqual(["1", "2"]);
  });

  it("leave a stream's own ids where it put them when a broadcast arrives", async () => {
    const { stream, sender } = unreadStream();

    sender.send({ data: 4, id: "t-4" });
    sender.broadcast({ event: "notice", data: "maintenance" });
    sender.send({ data: 5, id: "t-5" });

    const ids = [...(await wire(stream, 3)).matchAll(/^id: (.+)$/gm)].map((m) => m[1]);
    expect(ids).toEqual(["t-4", "t-5"]);
  });

  it("use a broadcast's own id when it has one", async () => {
    const { stream, sender } = unreadStream();

    sender.broadcast({ data: "x", id: "custom" });

    expect(await wire(stream, 1)).toContain("id: custom");
  });
});

describe("a notice about the stream", () => {
  it("is written as given, unnumbered", async () => {
    const { stream, sender } = unreadStream();

    sender.send({ data: "gen-1" });
    sender.notice("event: courier:shutdown\nretry: 10\ndata: null\n\n");

    expect(await wire(stream, 2)).toBe(
      'id: 1\ndata: "gen-1"\n\nevent: courier:shutdown\nretry: 10\ndata: null\n\n',
    );
  });
});

describe("a client that stops reading", () => {
  it("gets a broadcast refused once its buffer is full, not queued forever", () => {
    const { sender } = unreadStream();
    const big = "x".repeat(LIMITS.SSE_MAX_BUFFERED_BYTES / 2);

    expect(sender.broadcast({ data: big })).not.toBe(false);
    expect(sender.broadcast({ data: big })).toBe(false);
  });

  it("is let go after too many refusals in a row", () => {
    const { sender, onSlow } = unreadStream();
    sender.broadcast({ data: "x".repeat(LIMITS.SSE_MAX_BUFFERED_BYTES) });

    for (let i = 0; i < LIMITS.MAX_CONSECUTIVE_DROPS; i += 1) sender.broadcast({ data: "more" });

    expect(onSlow).toHaveBeenCalled();
  });

  it("still takes any single event into an empty buffer, however large", () => {
    const { sender } = unreadStream();

    expect(sender.broadcast({ data: "x".repeat(LIMITS.SSE_MAX_BUFFERED_BYTES * 2) })).not.toBe(false);
  });
});
