/**
 * A stream in the inspector: its messages newest first, a WebSocket's
 * marked sent or received, typed by their own `type` when they carry one;
 * its figures; how its messages spread over time; and how it ended.
 */
import { describe, expect, it } from "vitest";

import { playgroundCells } from "@/features/playground/playground-cells";
import { streamEnd, streamEnding, streamSparkline } from "@/features/requests/stream-activity";
import { streamMessages, streamStats } from "@/features/requests/stream-summary";
import { durationOf } from "@/screens/timeline/row-values";
import type { StreamEventRecord } from "@/store/types";
import type { PlaygroundHistoryEntry } from "@/store/types-ui";
import { requestEntry } from "./request-entry-fixture";

const OPENED = 1_000_000;
const event = (
  seq: number,
  at: number,
  fields: Partial<StreamEventRecord> = {},
): StreamEventRecord => ({
  seq,
  dataSize: 20,
  dataPreview: `{"type":"tick","n":${seq}}`,
  timestamp: OPENED + at,
  ...fields,
});

describe("a WebSocket's messages", () => {
  const socket = requestEntry({
    transport: "ws",
    startedAt: OPENED,
    streamStatus: "streaming",
    streamEvents: [
      event(1, 100, { eventType: "message", dataPreview: '{"type":"subscribe"}' }),
      event(2, 1_100, { eventType: "data" }),
      event(3, 2_100, { eventType: "data", dataPreview: "pong" }),
    ],
    streamEventCount: 3,
    streamTotalBytes: 60,
  });

  it("come newest first, sent or received, typed by their payload when it says", () => {
    expect(streamMessages(socket).map((m) => [m.seq, m.direction, m.type, m.offset])).toEqual([
      [3, "received", "received", 2_100],
      [2, "received", "tick", 1_100],
      [1, "sent", "subscribe", 100],
    ]);
  });

  it("come to how many went each way, the bytes and the rate", () => {
    expect(streamStats(socket, OPENED + 3_000)).toEqual([
      { label: "Sent", value: "1", tone: "brand" },
      { label: "Received", value: "2", tone: "ok" },
      { label: "Transferred", value: "60 B", tone: "normal" },
      { label: "Rate", value: "1.0/s", tone: "normal" },
    ]);
  });
});

describe("an event stream", () => {
  const closed = requestEntry({
    transport: "sse",
    startedAt: OPENED,
    streamStatus: "complete",
    streamDuration: 4_000,
    streamEvents: [event(1, 500, { eventType: "order.updated" }), event(2, 3_900)],
  });

  it("names its events by type, and says when the last came", () => {
    const now = OPENED + 20_000;

    expect(streamMessages(closed).map((m) => [m.direction, m.type])).toEqual([
      ["event", "tick"],
      ["event", "tick"],
    ]);
    expect(streamStats(closed, now)).toEqual([
      { label: "Events", value: "2", tone: "normal" },
      { label: "Transferred", value: "40 B", tone: "normal" },
      { label: "Rate", value: "0.5/s", tone: "normal" },
      { label: "Last event", value: "16s ago", tone: "normal" },
    ]);
  });

  it("stopped when it closed, and says it completed", () => {
    expect(streamEnd(closed, OPENED + 99_000)).toBe(OPENED + 4_000);
    expect(streamEnding(closed, OPENED + 20_000)).toEqual({
      failed: false,
      title: "Stream completed",
      detail: "closed after 4.00s · 16s ago",
    });
  });

  it("spreads its messages over its span, scaled to the busiest", () => {
    const { heights, span } = streamSparkline(closed, OPENED + 20_000, 4);

    expect(span).toBe(4_000);
    expect(heights).toEqual([1, 0, 0, 1]);
  });

  it("that failed says so, with the error", () => {
    const failed = {
      ...closed,
      streamStatus: "error" as const,
      error: { type: "error", message: "closed 1006" },
    };

    expect(streamEnding(failed, OPENED + 20_000)).toEqual({
      failed: true,
      title: "Closed with an error",
      detail: "closed 1006 · 16s ago",
    });
    expect(streamEnding({ ...closed, streamStatus: "streaming" }, OPENED + 1)).toBeNull();
  });

  it("marks a message Courier kept only the start of", () => {
    const long = requestEntry({
      transport: "sse",
      streamEvents: [event(1, 0, { dataSize: 2000, dataPreview: `${"x".repeat(512)}…` })],
    });

    expect(streamMessages(long)[0]?.truncated).toBe(true);
    expect(streamMessages(closed)[0]?.truncated).toBe(false);
  });
});

describe("a stream that opened since the page's clock last ticked", () => {
  const behind = OPENED - 4_000;

  it("has been open for no time yet in the Timeline and the inspector", () => {
    const live = requestEntry({ transport: "sse", startedAt: OPENED, streamStatus: "streaming" });
    const context = { now: behind, slowMs: 500, timestamps: "relative" as const, wide: true };

    expect(streamEnd(live, behind)).toBe(OPENED);
    expect(durationOf(live, "streaming", context).text).toBe("live 0µs");
  });

  it("has been open for no time yet in the Playground", () => {
    const entry: PlaygroundHistoryEntry = {
      id: "entry-1",
      rid: "rid-1",
      source: "api",
      group: "live",
      method: "ticks",
      variables: "{}",
      headers: "{}",
      mode: "direct",
      timestamp: OPENED,
      status: "pending",
      transport: "sse",
      streamStatus: "streaming",
    };

    const cells = playgroundCells({ entry, row: undefined, now: behind, slowMs: 500 });

    expect(cells.find((cell) => cell.label === "Open for")?.value).toBe("0µs");
  });
});
