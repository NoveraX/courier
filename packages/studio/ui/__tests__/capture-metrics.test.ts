/**
 * The capture panel's numbers over the requests the captured calls sent:
 * a read another call's request answered is in none of them.
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
      requests: 20,
      perSecond: 1.9,
      p95: 900,
      errorRate: 5,
    });
  });

  it("counts an answer its schema refused as a failure", () => {
    expect(captureMetrics([request({ status: "validation_error" })], 0).errorRate).toBe(100);
  });

  it("has no p95 before a request finishes, and no errors before any request", () => {
    expect(captureMetrics([request({ status: "pending" })], 0).p95).toBeNull();
    expect(captureMetrics([], 0)).toEqual({ requests: 0, perSecond: 0, p95: null, errorRate: 0 });
  });

  it("leaves out a read another call's request answered: its wait, its pace and its failure are that request's", () => {
    const now = 100_000;
    const failed = { startedAt: now - 1000, status: "error" as const };
    const requests = [
      request({
        id: "sent",
        ...failed,
        timing: { total: 300, middleware: 0, fetch: 0, validation: 0 },
      }),
      ...[1, 2, 3].map((i) =>
        request({
          id: `joined${i}`,
          ...failed,
          timing: { total: 900, middleware: 0, fetch: 0, validation: 0 },
          shared: { by: "flight", with: "sent" },
        }),
      ),
      request({
        id: "ok",
        startedAt: now - 1000,
        timing: { total: 100, middleware: 0, fetch: 0, validation: 0 },
      }),
    ];

    expect(captureMetrics(requests, now)).toEqual({
      requests: 2,
      perSecond: 0.2,
      p95: 300,
      errorRate: 50,
    });
  });
});
