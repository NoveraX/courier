/**
 * The capture panel's numbers over the captured requests.
 */
import { describe, expect, it } from "vitest";
import { captureMetrics } from "@/screens/welcome/capture-metrics";
import type { RequestEntry } from "@/store";

function request(over: Partial<RequestEntry>): RequestEntry {
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
    ...over,
  };
}

describe("captureMetrics", () => {
  it("counts the requests, the rate over ten seconds, the p95 and the error share", () => {
    const now = 100_000;
    const requests = [
      ...Array.from({ length: 19 }, (_, i) =>
        request({
          id: `ok${i}`,
          startedAt: now - 1000,
          timing: { total: 10 + i, middleware: 0, fetch: 0, validation: 0 },
        }),
      ),
      request({
        id: "slow",
        startedAt: now - 60_000,
        status: "error",
        timing: { total: 900, middleware: 0, fetch: 0, validation: 0 },
      }),
    ];

    expect(captureMetrics(requests, now)).toEqual({
      count: 20,
      perSecond: 1.9,
      p95: 900,
      errorRate: 5,
    });
  });

  it("has no p95 before a request finishes, and no errors before any request", () => {
    expect(captureMetrics([request({ status: "pending" })], 0).p95).toBeNull();
    expect(captureMetrics([], 0)).toEqual({ count: 0, perSecond: 0, p95: null, errorRate: 0 });
  });
});
