import { describe, expect, it } from "vitest";
import { parseSSEStream } from "../src/realtime/sse/parse-sse";

/** Helper: create a ReadableStream from string chunks */
function createStream(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

/** Collect all events from a parseSSEStream generator */
async function collect(stream: ReadableStream<Uint8Array>) {
  const events = [];
  for await (const event of parseSSEStream(stream)) {
    events.push(event);
  }
  return events;
}

describe("parseSSEStream", () => {
  it("parses a simple data event", async () => {
    const events = await collect(createStream('data: hello\n\n'));

    expect(events).toEqual([{ data: "hello" }]);
  });

  it("parses event with id and event type", async () => {
    const events = await collect(createStream('id: 42\nevent: update\ndata: payload\n\n'));

    expect(events).toEqual([{ id: "42", event: "update", data: "payload" }]);
  });

  it("parses retry field as number", async () => {
    const events = await collect(createStream('data: x\nretry: 5000\n\n'));

    expect(events).toEqual([{ data: "x", retry: 5000 }]);
  });

  it("ignores invalid retry (non-numeric)", async () => {
    const events = await collect(createStream('data: x\nretry: abc\n\n'));

    expect(events).toEqual([{ data: "x" }]);
  });

  it("concatenates multi-line data with newlines", async () => {
    const events = await collect(createStream('data: line1\ndata: line2\ndata: line3\n\n'));

    expect(events).toEqual([{ data: "line1\nline2\nline3" }]);
  });

  it("returns null for comment-only blocks (heartbeats)", async () => {
    const events = await collect(createStream(': ping\n\n'));

    expect(events).toEqual([null]);
  });

  it("handles multiple events in one chunk", async () => {
    const events = await collect(createStream('data: first\n\ndata: second\n\n'));

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ data: "first" });
    expect(events[1]).toEqual({ data: "second" });
  });

  it("handles events split across chunks", async () => {
    const events = await collect(createStream('data: hel', 'lo\n\n'));

    expect(events).toEqual([{ data: "hello" }]);
  });

  it("handles event boundary split across chunks", async () => {
    const events = await collect(createStream('data: a\n', '\ndata: b\n\n'));

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ data: "a" });
    expect(events[1]).toEqual({ data: "b" });
  });

  it("handles CRLF line endings", async () => {
    const events = await collect(createStream('data: hello\r\n\r\n'));

    expect(events).toEqual([{ data: "hello" }]);
  });

  it("handles CR line endings", async () => {
    const events = await collect(createStream('data: hello\r\r'));

    expect(events).toEqual([{ data: "hello" }]);
  });

  it("strips optional space after colon", async () => {
    const events = await collect(createStream('data:no-space\n\ndata: with-space\n\n'));

    expect(events[0]).toEqual({ data: "no-space" });
    expect(events[1]).toEqual({ data: "with-space" });
  });

  it("handles field without colon (empty value)", async () => {
    const events = await collect(createStream('data\n\n'));

    expect(events).toEqual([{ data: "" }]);
  });

  it("flushes remaining buffer on stream close", async () => {
    // Server closes without trailing double newline
    const events = await collect(createStream('data: final'));

    expect(events).toEqual([{ data: "final" }]);
  });

  it("ignores unknown fields", async () => {
    const events = await collect(createStream('data: ok\nfoo: bar\n\n'));

    expect(events).toEqual([{ data: "ok" }]);
  });
});
