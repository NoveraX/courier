/**
 * A live stream whose connection is not open says so, wherever Studio
 * would otherwise call it open and live: being opened, or being opened
 * again — why the last connection ended, how many failed in a row, when the
 * next one opens — and, once it gives up, that no connection ever opened
 * and what usually fixes that. A stream a runtime told nothing of stands
 * open, as before.
 */
import { describe, expect, it } from "vitest";

import { playgroundCells } from "@/features/playground/playground-cells";
import { failureHint } from "@/features/requests/failure-hints";
import { requestChecks } from "@/features/requests/request-checks";
import { failureOf } from "@/features/requests/request-failure";
import { statCellsOf } from "@/features/requests/stat-cells";
import { connectionBanner, liveWord, stateLabelOf } from "@/features/requests/stream-connection";
import { durationOf } from "@/screens/timeline/row-values";
import { applyEvents } from "@/store/apply-events";
import type { EventType, RequestEntry } from "@/store/types";
import { requestEntry } from "./request-entry-fixture";

const REFUSED = { code: "ECONNREFUSED", message: "connect ECONNREFUSED 127.0.0.1:4010" };

function streamAt(...events: Array<[EventType, Record<string, unknown>]>): RequestEntry {
  const opened = {
    id: "s1",
    type: "stream:open" as const,
    requestId: "s1",
    source: "api",
    method: "feed",
    transport: "sse",
    timestamp: 1_000,
    sessionId: "app",
  };
  const rest = events.map(([type, fields], i) => ({
    id: "s1",
    type,
    requestId: "s1",
    sessionId: "app",
    timestamp: 1_000 + i,
    ...fields,
  }));
  const { requests } = applyEvents([], [opened, ...rest], {
    maxRequests: 10,
    ignorePatterns: [],
    paused: false,
  });
  const stream = requests[0];
  if (!stream) throw new Error("the stream was not kept");
  return stream;
}

const reconnecting = (
  fields: Record<string, unknown> = {},
): [EventType, Record<string, unknown>] => [
  "stream:status",
  {
    status: "reconnecting",
    openedBefore: false,
    failures: 3,
    retryIn: 4_000,
    cause: REFUSED,
    timestamp: 10_000,
    ...fields,
  },
];

describe("a stream's connection, as the store keeps it", () => {
  it("is being opened, then being opened again with why, how many failed and when the next opens", () => {
    const stream = streamAt(
      ["stream:status", { status: "connecting", timestamp: 2_000 }],
      reconnecting(),
    );

    expect(stream.streamConnection).toEqual({
      status: "reconnecting",
      since: 10_000,
      openedBefore: false,
      failures: 3,
      cause: REFUSED,
      retryAt: 14_000,
    });
  });

  it("keeps when the tries began, and that a connection opened before", () => {
    const stream = streamAt(
      ["stream:status", { status: "open", timestamp: 2_000 }],
      reconnecting({ timestamp: 5_000, failures: 0, openedBefore: true }),
      reconnecting({ timestamp: 9_000, failures: 1 }),
    );

    expect(stream.streamConnection).toMatchObject({
      status: "reconnecting",
      since: 5_000,
      openedBefore: true,
      failures: 1,
    });
  });

  it("stands open once a connection opens again, why the last one ended let go", () => {
    const stream = streamAt(reconnecting(), [
      "stream:status",
      { status: "open", timestamp: 20_000 },
    ]);

    expect(stream.streamConnection).toEqual({ status: "open", since: 20_000, openedBefore: true });
  });

  it("keeps how it stood once the stream ended, and a status in another shape changes nothing", () => {
    const stream = streamAt(
      reconnecting(),
      ["stream:status", { status: "flapping" }],
      ["stream:error", { error: "SSE connection failed 3 times in a row: fetch failed" }],
      ["stream:status", { status: "open" }],
    );

    expect(stream.streamConnection?.status).toBe("reconnecting");
    expect(stream.error).toEqual({
      type: "StreamError",
      message: "SSE connection failed 3 times in a row: fetch failed",
      cause: REFUSED,
    });
  });
});

describe("a stream whose connection is being opened again", () => {
  const stream = streamAt(reconnecting());

  it("says why, how many failed and when the next opens, over its messages", () => {
    expect(connectionBanner(stream, 11_000)).toEqual({
      title: "Reconnecting",
      detail: "ECONNREFUSED · connect ECONNREFUSED 127.0.0.1:4010 · 3 failed attempts · next in 3s",
    });
  });

  it("has a handshake that never opened and a connection being opened again, not one open and live", () => {
    const [handshake, connection] = requestChecks(stream);

    expect(handshake).toEqual({
      label: "Handshake",
      detail: "Never opened",
      meta: "",
      state: "err",
    });
    expect(connection).toEqual({
      label: "Connection",
      detail: "Reconnecting — ECONNREFUSED · connect ECONNREFUSED 127.0.0.1:4010",
      meta: "3 failed attempts",
      state: "warn",
    });
  });

  it("is reconnecting in its figures, and retrying in a list", () => {
    const [status, open] = statCellsOf(stream, { now: 11_000, slowMs: 500, p95: null });

    expect(status).toMatchObject({ value: "Reconnecting", tone: "warn" });
    expect(open?.sub).toBe("reconnecting");
    expect(liveWord(stream)).toBe("retrying");
    expect(
      durationOf(stream, "streaming", {
        now: 11_000,
        slowMs: 500,
        timestamps: "relative",
        wide: true,
      }),
    ).toMatchObject({ text: "retrying", tone: "text-warn" });
  });

  it("says only that the connection dropped, for one that had delivered", () => {
    const dropped = streamAt(
      ["stream:status", { status: "open" }],
      reconnecting({
        failures: 0,
        openedBefore: true,
        cause: { message: "The connection closed before the stream ended" },
      }),
    );

    expect(connectionBanner(dropped, 10_000)?.detail).toBe(
      "The connection closed before the stream ended · next in 4s",
    );
    expect(requestChecks(dropped)[0]).toMatchObject({ label: "Handshake", state: "ok" });
  });
});

describe("a stream whose first connection is being opened", () => {
  const stream = streamAt(["stream:status", { status: "connecting", timestamp: 2_000 }]);

  it("says it waits for the server, for how long, and runs as a request in flight", () => {
    expect(connectionBanner(stream, 5_200)).toEqual({
      title: "Connecting",
      detail: "Waiting for the server to answer · 3.20s",
    });
    expect(requestChecks(stream).slice(0, 2)).toEqual([
      { label: "Handshake", detail: "Not opened yet", meta: "", state: "idle" },
      { label: "Connection", detail: "Connecting", meta: "", state: "idle" },
    ]);
    expect(liveWord(stream)).toBe("···");
    expect(
      durationOf(stream, "streaming", {
        now: 5_200,
        slowMs: 500,
        timestamps: "relative",
        wide: true,
      }).tone,
    ).toBe("text-warn");
  });
});

describe("a stream that gave up reconnecting", () => {
  const stream = streamAt(reconnecting(), [
    "stream:error",
    { error: "SSE connection failed 3 times in a row: fetch failed" },
  ]);

  it("tells that no connection ever opened, with the platform's code and the fix for it", () => {
    const failure = failureOf(stream);

    expect(failure).toMatchObject({
      code: "ECONNREFUSED",
      cause: "connect ECONNREFUSED 127.0.0.1:4010",
      where: "The stream ended without a connection ever opening",
    });
    expect(failure?.stages[0]).toEqual({ label: "Handshake", state: "err", meta: "never opened" });
    expect(failure?.stages[1]).toMatchObject({ label: "Messages", state: "skip" });
    expect(failureHint(stream)).toMatch(/connection to it failed \(ECONNREFUSED\)/);
    expect(statCellsOf(stream, { now: 20_000, slowMs: 500, p95: null })[0]).toMatchObject({
      value: "Error",
      tone: "err",
    });
    expect(connectionBanner(stream, 20_000)).toBeNull();
  });
});

describe("a Playground run of a stream whose connection is being opened again", () => {
  it("is reconnecting in its figures, and connecting while its first one is being opened", () => {
    const run = {
      id: "e1",
      rid: "r1",
      source: "api",
      group: "live",
      method: "feed",
      variables: "{}",
      headers: "{}",
      mode: "direct" as const,
      timestamp: 1_000,
      status: "pending" as const,
      transport: "sse" as const,
      streamStatus: "streaming" as const,
    };
    const opening = streamAt(["stream:status", { status: "connecting" }]);

    expect(
      playgroundCells({ entry: run, row: streamAt(reconnecting()), now: 11_000, slowMs: 500 })[0],
    ).toMatchObject({
      value: "Reconnecting",
      tone: "warn",
    });
    expect(
      playgroundCells({ entry: run, row: opening, now: 11_000, slowMs: 500 })[0],
    ).toMatchObject({
      value: "Connecting…",
    });
  });
});

describe("a stream its caller closed while it was being opened again", () => {
  const stream = streamAt(reconnecting(), [
    "stream:close",
    { reason: "disconnect", duration: 20_000 },
  ]);

  it("keeps why it closed, and says it closed while reconnecting, with why, never as the server's close", () => {
    const [handshake, connection] = requestChecks(stream);

    expect(stream.streamCloseReason).toBe("disconnect");
    expect(handshake).toMatchObject({ detail: "Never opened", state: "err" });
    expect(connection).toEqual({
      label: "Connection",
      detail:
        "Closed by the caller while reconnecting — ECONNREFUSED · connect ECONNREFUSED 127.0.0.1:4010",
      meta: "20.00s",
      state: "warn",
    });
    expect(statCellsOf(stream, { now: 30_000, slowMs: 500, p95: null })[0]).toMatchObject({
      value: "Closed",
      tone: "warn",
    });
  });

  it("is told Reconnecting to a screen reader and the Timeline's search while it was live", () => {
    expect(stateLabelOf(streamAt(reconnecting()), "streaming")).toBe("Reconnecting");
    expect(stateLabelOf(streamAt(["stream:status", { status: "connecting" }]), "streaming")).toBe(
      "Connecting",
    );
    expect(stateLabelOf(stream, "closed")).toBe("Closed");
  });
});

describe("a stream a runtime told nothing of its connection", () => {
  it("stands open and live, as before", () => {
    const stream = requestEntry({
      transport: "sse",
      status: "pending",
      streamStatus: "streaming",
      statusCode: undefined,
    });

    expect(connectionBanner(stream, 10_000)).toBeNull();
    expect(requestChecks(stream).slice(0, 2)).toEqual([
      { label: "Handshake", detail: "Opened as text/event-stream", meta: "", state: "ok" },
      { label: "Connection", detail: "Open", meta: "live", state: "ok" },
    ]);
    expect(liveWord(stream)).toBe("live");
    expect(
      failureHint({ ...stream, error: { type: "StreamError", message: "Stream failed" } }),
    ).toMatch(/server's logs/);
  });
});
