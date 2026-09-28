/**
 * How the Studio UI records a request that failed.
 *
 * A failed row kept only the error's kind and message: its Timing, Headers
 * and Response tabs were empty, the Waterfall drew it at 0µs, a proxy row
 * showed no status although the browser received one, and a refused schema
 * was shown as a plain error that had lost its issues.
 */
import { describe, expect, it } from "vitest";

import { applyEvents } from "../ui/src/store/apply-events";
import type { RequestEntry } from "../ui/src/store/types-request";

type Event = Parameters<typeof applyEvents>[1][number];

const OPTIONS = { maxRequests: 100, ignorePatterns: [] };

function started(): { requests: RequestEntry[] } {
  const start = {
    type: "request:start",
    id: "req-1",
    sessionId: "app",
    timestamp: 1,
    source: "api",
    group: "faults",
    method: "missing",
    mode: "proxy",
    middlewareCount: 0,
    hasValidation: { variables: true, response: false },
  } as Event;
  return applyEvents([], [start], OPTIONS);
}

function apply(state: { requests: RequestEntry[] }, event: Record<string, unknown>): RequestEntry {
  const next = applyEvents(state.requests, [{ sessionId: "app", timestamp: 2, ...event } as Event], OPTIONS);
  const [entry] = next.requests;
  if (!entry) throw new Error("no request recorded");
  return entry;
}

describe("a failed request in the UI", () => {
  it("keeps the status its caller received, the upstream's answer and its timing", () => {
    const entry = apply(started(), {
      type: "request:error",
      id: "req-1",
      requestId: "req-1",
      error: { type: "http", status: 404, message: "HTTP 404" },
      status: 404,
      headers: { "x-upstream": "yes" },
      data: { message: "not here" },
      timing: { total: 12, middleware: 0, fetch: 10, validation: 0 },
    });

    expect(entry.status).toBe("error");
    expect(entry.statusCode).toBe(404);
    expect(entry.headers).toEqual({ "x-upstream": "yes" });
    expect(entry.data).toEqual({ message: "not here" });
    expect(entry.timing?.total).toBe(12);
  });

  it("shows the status a proxy answered with where the upstream had none", () => {
    const entry = apply(started(), {
      type: "request:error",
      id: "req-1",
      requestId: "req-1",
      error: { type: "timeout", message: "Request timed out" },
      status: 504,
    });

    expect(entry.statusCode).toBe(504);
  });

  it("records a refused schema as a validation error that keeps its issues", () => {
    const issues = [{ message: "Too short", path: ["name"] }];
    const failed = apply(started(), {
      type: "validation:fail",
      id: "req-1",
      requestId: "req-1",
      target: "variables",
      issues,
      duration: 1,
    });
    const entry = apply({ requests: [failed] }, {
      type: "request:error",
      id: "req-1",
      requestId: "req-1",
      error: { type: "validation", message: "Validation failed (variables): Too short" },
    });

    expect(entry.status).toBe("validation_error");
    expect(entry.error?.validationIssues).toEqual(issues);
  });

  it("records a cancelled request as aborted", () => {
    const entry = apply(started(), {
      type: "request:error",
      id: "req-1",
      requestId: "req-1",
      error: { type: "aborted", message: "This operation was aborted" },
    });

    expect(entry.status).toBe("aborted");
  });
});
