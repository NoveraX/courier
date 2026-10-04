/**
 * An upload in the Timeline.
 *
 * The browser reports an upload's progress before the proxy announces the
 * call, and the proxy announces it twice: when it arrives and once it has read
 * it. The row appears with the first progress, and stays one row through
 * both announcements, rather than a second row left pending for good.
 */
import { describe, expect, it } from "vitest";

import { applyEvents } from "../src/store/apply-events";
import type { RequestEntry } from "../src/store/types";

type Event = Parameters<typeof applyEvents>[1][number];

const OPTIONS = { maxRequests: 100, ignorePatterns: [], paused: false };

function event(type: string, fields: Record<string, unknown>): Event {
  return { type, id: `ev-${type}`, sessionId: "app", timestamp: 1, ...fields } as Event;
}

function progress(percentage: number): Event {
  return event("upload:progress", {
    requestId: "up_1",
    source: "api",
    method: "upload",
    loaded: percentage * 10,
    total: 1000,
    percentage,
  });
}

const arrival = event("request:start", {
  id: "up_1",
  source: "api",
  method: "upload",
  mode: "proxy",
  middlewareCount: 0,
  hasValidation: { variables: false, response: false },
  timestamp: 5,
});

const executor = event("request:start", {
  id: "up_1",
  source: "api",
  method: "upload",
  mode: "proxy",
  variables: { file: { name: "photo.bin", type: "", size: 1000 } },
  middlewareCount: 2,
  hasValidation: { variables: true, response: false },
  timestamp: 9,
});

function rowsAfter(events: Event[], requests: RequestEntry[] = []): RequestEntry[] {
  return applyEvents(requests, events, OPTIONS).requests;
}

describe("an upload's row", () => {
  it("appears with the first progress and follows it", () => {
    const [row] = rowsAfter([progress(10), progress(40)]);

    expect(row).toMatchObject({ id: "up_1", status: "pending", mode: "proxy" });
    expect(row?.upload).toEqual({ loaded: 400, total: 1000, percentage: 40, done: false });
  });

  it("stays one row when the proxy announces the call twice", () => {
    const rows = rowsAfter([progress(10), arrival, progress(100), executor]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      startedAt: 1,
      middlewareCount: 2,
      hasValidation: { variables: true, response: false },
      variables: { file: { name: "photo.bin", type: "", size: 1000 } },
    });
    expect(rows[0]?.upload?.done).toBe(true);
  });

  it("ends when the call answers", () => {
    const rows = rowsAfter([
      arrival,
      progress(100),
      event("upload:complete", { requestId: "up_1" }),
      executor,
      event("request:end", { requestId: "up_1", status: 201, timing: { total: 12 } }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "success", statusCode: 201, upload: { done: true } });
  });

  it("shows a refused upload as an error with its status", () => {
    const rows = rowsAfter([
      arrival,
      event("request:error", {
        requestId: "up_1",
        error: { type: "http", status: 413, message: "Upload body too large" },
      }),
    ]);

    expect(rows[0]).toMatchObject({ status: "error", statusCode: 413 });
  });

  it("keeps a row already shown when recording pauses", () => {
    const [shown] = rowsAfter([arrival]);
    const rows = applyEvents(shown ? [shown] : [], [progress(60), executor], {
      ...OPTIONS,
      paused: true,
    }).requests;

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ middlewareCount: 2, upload: { percentage: 60 } });
  });
});
