/**
 * What the status bar and the navigation drawer count among the calls
 * captured: the calls and the requests they sent, the failures, the calls
 * in flight, the streams open, and the bytes the answers brought — a read
 * another call's request answered counted among the calls alone.
 */
import { describe, expect, it } from "vitest";

import { capturedText, countTraffic } from "@/shell/status-bar/traffic-counts";
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

    expect(counts).toEqual({
      calls: 4,
      requests: 4,
      errors: 1,
      pending: 2,
      streams: 1,
      bytes: 512,
    });
    expect(capturedText(counts)).toBe("4 req");
  });

  it("counts a read another call's request answered among the calls, and not its failure or bytes", () => {
    const counts = countTraffic([
      request({ id: "sent", status: "error", size: 200 }),
      request({ id: "joined", status: "error", size: 200, shared: { by: "flight", with: "sent" } }),
      request({ id: "waiting", status: "pending" }),
    ]);

    expect(counts).toEqual({
      calls: 3,
      requests: 2,
      errors: 1,
      pending: 1,
      streams: 0,
      bytes: 200,
    });
    expect(capturedText(counts)).toBe("3 calls · 2 req");
  });

  it("counts an answer its schema refused as a failure, as every other view does", () => {
    expect(countTraffic([request({ status: "validation_error" })]).errors).toBe(1);
  });

  it("counts nothing among no requests", () => {
    expect(countTraffic([])).toEqual({
      calls: 0,
      requests: 0,
      errors: 0,
      pending: 0,
      streams: 0,
      bytes: 0,
    });
  });
});
