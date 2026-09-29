import { describe, expect, it } from "vitest";
import { parseSSEFrames, parseSSEStream } from "../src/realtime/sse/parse-sse";

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
    const events = await collect(createStream("data: hello\n\n"));

    expect(events).toEqual([{ data: "hello" }]);
  });

  it("parses event with id and event type", async () => {
    const events = await collect(createStream("id: 42\nevent: update\ndata: payload\n\n"));

    expect(events).toEqual([{ id: "42", event: "update", data: "payload" }]);
  });

  it("parses retry field as number", async () => {
    const events = await collect(createStream("data: x\nretry: 5000\n\n"));

    expect(events).toEqual([{ data: "x", retry: 5000 }]);
  });

  it("ignores invalid retry (non-numeric)", async () => {
    const events = await collect(createStream("data: x\nretry: abc\n\n"));

    expect(events).toEqual([{ data: "x" }]);
  });

  it("concatenates multi-line data with newlines", async () => {
    const events = await collect(createStream("data: line1\ndata: line2\ndata: line3\n\n"));

    expect(events).toEqual([{ data: "line1\nline2\nline3" }]);
  });

  it("returns null for comment-only blocks (heartbeats)", async () => {
    const events = await collect(createStream(": ping\n\n"));

    expect(events).toEqual([null]);
  });

  it("handles multiple events in one chunk", async () => {
    const events = await collect(createStream("data: first\n\ndata: second\n\n"));

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ data: "first" });
    expect(events[1]).toEqual({ data: "second" });
  });

  it("handles events split across chunks", async () => {
    const events = await collect(createStream("data: hel", "lo\n\n"));

    expect(events).toEqual([{ data: "hello" }]);
  });

  it("handles event boundary split across chunks", async () => {
    const events = await collect(createStream("data: a\n", "\ndata: b\n\n"));

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ data: "a" });
    expect(events[1]).toEqual({ data: "b" });
  });

  it("handles CRLF line endings", async () => {
    const events = await collect(createStream("data: hello\r\n\r\n"));

    expect(events).toEqual([{ data: "hello" }]);
  });

  it("handles CR line endings", async () => {
    const events = await collect(createStream("data: hello\r\r"));

    expect(events).toEqual([{ data: "hello" }]);
  });

  it("strips optional space after colon", async () => {
    const events = await collect(createStream("data:no-space\n\ndata: with-space\n\n"));

    expect(events[0]).toEqual({ data: "no-space" });
    expect(events[1]).toEqual({ data: "with-space" });
  });

  it("handles field without colon (empty value)", async () => {
    const events = await collect(createStream("data\n\n"));

    expect(events).toEqual([{ data: "" }]);
  });

  it("discards an event the stream ends in the middle of", async () => {
    const events = await collect(createStream("id: 4\ndata: 4\n\nid: 5\ndata: 12"));

    expect(events).toEqual([{ id: "4", data: "4" }]);
  });

  it("takes a blank line whatever mix of line endings ends it", async () => {
    const events = await collect(createStream("data: 1\n\r\ndata: 2\r\n\ndata: 3\r\rdata: 4\n\n"));

    expect(events).toEqual([{ data: "1" }, { data: "2" }, { data: "3" }, { data: "4" }]);
  });

  it("joins a CRLF split across chunks into one line ending", async () => {
    const events = await collect(createStream("data: a\r", "\n\r", "\ndata: b\r\n\r\n"));

    expect(events).toEqual([{ data: "a" }, { data: "b" }]);
  });

  it("dispatches no event for a block that only sets an id or a retry", async () => {
    const events = await collect(createStream("retry: 3000\n\nid: 77\n\ndata: 1\n\n"));

    expect(events).toEqual([null, null, { data: "1" }]);
  });

  it("leaves the event type unset when its field is empty", async () => {
    const events = await collect(createStream("event:\ndata: 1\n\n"));

    expect(events).toEqual([{ data: "1" }]);
  });

  it("ignores a retry that is not a whole number of milliseconds", async () => {
    const events = await collect(createStream("data: x\nretry: 1e3\n\ndata: y\nretry:\n\n"));

    expect(events).toEqual([{ data: "x" }, { data: "y" }]);
  });

  it("ignores an id containing a NUL character", async () => {
    const events = await collect(createStream("id: a\u0000b\ndata: x\n\n"));

    expect(events).toEqual([{ data: "x" }]);
  });

  it("ignores unknown fields", async () => {
    const events = await collect(createStream("data: ok\nfoo: bar\n\n"));

    expect(events).toEqual([{ data: "ok" }]);
  });
});

describe("parseSSEFrames", () => {
  async function frames(...chunks: string[]) {
    const seen = [];
    for await (const frame of parseSSEFrames(createStream(...chunks))) seen.push(frame);
    return seen;
  }

  it("reports the id and retry a block sets, whether or not it dispatches", async () => {
    expect(await frames("retry: 3000\n\nid: 77\n\nid: 78\ndata: 1\n\n")).toEqual([
      { retry: 3000 },
      { id: "77" },
      { id: "78", event: { id: "78", data: "1" } },
    ]);
  });

  it("reports a heartbeat as a block that says nothing", async () => {
    expect(await frames(": ping\n\n")).toEqual([{}]);
  });

  it("reports an empty id, which resets the last one", async () => {
    expect(await frames("id\n\n")).toEqual([{ id: "" }]);
  });

  it("reports nothing for blank lines with nothing before them", async () => {
    expect(await frames("\n\n\r\ndata: 1\n\n\n\n")).toEqual([{ event: { data: "1" } }]);
  });
});
