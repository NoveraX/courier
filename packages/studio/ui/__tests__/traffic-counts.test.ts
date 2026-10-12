/**
 * What the status bar and the navigation drawer count among the requests
 * captured: the failures, the calls in flight, the streams open, and the
 * bytes the responses brought.
 */
import { describe, expect, it } from "vitest";

import { countTraffic } from "@/shell/status-bar/traffic-counts";
import type { RequestEntry } from "@/store";

function request(patch: Partial<RequestEntry>): RequestEntry {
  return {
    id: "r",
    source: "api",
    group: "users",
    method: "list",
    variables: undefined,
    mode: "direct",
    status: "success",
    middlewareCount: 0,
    middlewareEntries: [],
    hasValidation: { variables: false, response: false },
    startedAt: 0,
    sessionId: "s",
    ...patch,
  };
}

describe("countTraffic", () => {
  it("counts the failures, the calls in flight, the streams open and the bytes", () => {
    const counts = countTraffic([
      request({ size: 300 }),
      request({ status: "error", size: 200 }),
      request({ status: "pending" }),
      request({ status: "pending", streamStatus: "streaming", size: 12 }),
    ]);

    expect(counts).toEqual({ errors: 1, pending: 2, streams: 1, bytes: 512 });
  });

  it("counts nothing among no requests", () => {
    expect(countTraffic([])).toEqual({ errors: 0, pending: 0, streams: 0, bytes: 0 });
  });
});
