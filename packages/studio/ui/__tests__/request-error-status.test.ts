/**
 * @vitest-environment jsdom
 */
/**
 * A request that failed its schema is a validation error with its issues
 * listed, and a cancelled one is aborted — as the runtime reports them
 * (`validation`, `aborted`) — not a red "Error", so the Status filter's
 * "Validation Error" and "Aborted" match them and the issues a failed
 * validation reported are kept; an aborted request is no failure.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { isFailure } from "@/features/analytics/call-stats";
import { matchesFilter, NO_SELECTION, OPEN_FILTER } from "@/features/requests/timeline-filter";
import type { RequestEntry, StudioEvent } from "@/store";
import { useStudioStore } from "@/store";

type Event = StudioEvent & Record<string, unknown>;

function event(type: string, fields: Record<string, unknown>): Event {
  return { id: "r1", type: type as Event["type"], timestamp: 1, sessionId: "s", ...fields };
}

const start = event("request:start", { source: "api", group: "users", method: "get" });

/* The requests the Timeline shows with one status chosen in its Status filter. */
function withStatus(status: string): string[] {
  const filter = { ...OPEN_FILTER, selected: { ...NO_SELECTION, status: [status] } };
  return useStudioStore
    .getState()
    .requests.filter((r: RequestEntry) => matchesFilter(r, filter, { slowMs: 500 }))
    .map((r) => r.id);
}

function statusOf(id = "r1") {
  return useStudioStore.getState().requests.find((r) => r.id === id);
}

beforeEach(() => {
  useStudioStore.setState({ requests: [], droppedRequests: 0, paused: false });
});

describe("a request that failed its response schema", () => {
  beforeEach(() => {
    useStudioStore.getState().handleEvents([
      start,
      event("validation:fail", {
        requestId: "r1",
        target: "response",
        issues: [
          { message: "Expected a number", path: ["user", { key: "age" }] },
          { message: "Required" },
        ],
      }),
      event("request:error", {
        requestId: "r1",
        error: {
          type: "validation",
          message: "Validation failed (response): Expected a number; Required",
        },
      }),
    ]);
  });

  it("is a validation error", () => {
    expect(statusOf()?.status).toBe("validation_error");
  });

  it("keeps the issues the validation reported, each with its path", () => {
    expect(statusOf()?.error?.validationIssues).toEqual([
      { path: "user.age", message: "Expected a number" },
      { path: "", message: "Required" },
    ]);
  });

  it("is what the Validation status filter finds", () => {
    expect(withStatus("validation_error")).toEqual(["r1"]);
  });
});

describe("a request its caller cancelled", () => {
  beforeEach(() => {
    useStudioStore.getState().handleEvents([
      start,
      event("request:error", {
        requestId: "r1",
        error: { type: "aborted", message: "This operation was aborted" },
      }),
    ]);
  });

  it("is aborted", () => {
    expect(statusOf()?.status).toBe("aborted");
  });

  it("is what the Aborted status filter finds", () => {
    expect(withStatus("aborted")).toEqual(["r1"]);
  });

  it("is not counted as a failure", () => {
    expect(useStudioStore.getState().requests.filter(isFailure)).toEqual([]);
  });
});

describe("a request that failed otherwise", () => {
  it("is an error", () => {
    useStudioStore.getState().handleEvents([
      start,
      event("request:error", {
        requestId: "r1",
        error: { type: "http", status: 500, message: "HTTP 500" },
      }),
    ]);

    expect(statusOf()?.status).toBe("error");
  });
});
