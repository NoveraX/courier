/**
 * How a call's read was answered by another call's request reaches a
 * record as the runtime sent it — from its end or its failure, or from a
 * saved session — and anything not in that shape is left out.
 */
import { describe, expect, it } from "vitest";

import { requestFromSaved } from "@/features/sessions/saved-request";
import { applyEvents } from "@/store/apply-events";

const OPTIONS = { maxRequests: 100, ignorePatterns: [], paused: false };

function start(requestId: string) {
  return {
    type: "request:start" as const,
    id: requestId,
    requestId,
    sessionId: "s",
    timestamp: 1_000,
    source: "api",
    method: "list",
    mode: "direct",
    middlewareCount: 0,
    hasValidation: { variables: false, response: false },
  };
}

describe("a record", () => {
  it("takes it from the call's end, and from its failure", () => {
    const { requests } = applyEvents(
      [],
      [
        start("a"),
        start("b"),
        {
          type: "request:end" as const,
          id: "a:end",
          requestId: "a",
          sessionId: "s",
          timestamp: 1_100,
          status: 200,
          data: null,
          size: 2,
          headers: {},
          requestHeaders: {},
          timing: { total: 100, middleware: 0, fetch: 100, validation: 0 },
        },
        {
          type: "request:error" as const,
          id: "b:error",
          requestId: "b",
          sessionId: "s",
          timestamp: 1_100,
          error: { type: "http", status: 502, message: "HTTP 502" },
          shared: { by: "flight", with: "a" },
        },
      ],
      OPTIONS,
    );

    expect(requests.find((r) => r.id === "a")?.shared).toBeUndefined();
    expect(requests.find((r) => r.id === "b")?.shared).toEqual({ by: "flight", with: "a" });
  });

  it("takes it from the end of a call another's request answered", () => {
    const { requests } = applyEvents(
      [],
      [
        start("c"),
        {
          type: "request:end" as const,
          id: "c:end",
          requestId: "c",
          sessionId: "s",
          timestamp: 1_100,
          status: 200,
          data: null,
          size: 2,
          headers: {},
          requestHeaders: {},
          timing: { total: 30, middleware: 0, fetch: 30, validation: 0 },
          shared: { by: "render", with: "a" },
        },
      ],
      OPTIONS,
    );

    expect(requests.find((r) => r.id === "c")?.shared).toEqual({ by: "render", with: "a" });
  });

  it("takes it from a saved session", () => {
    const saved = {
      id: "r",
      source: "api",
      method: "list",
      startedAt: 1,
      shared: { by: "render", with: "q" },
    };

    expect(requestFromSaved(saved)?.shared).toEqual({ by: "render", with: "q" });
  });
});
