/**
 * @vitest-environment jsdom
 *
 * A request's checks say how its validation ended, as its events reported
 * it, not only that its endpoint declares a schema: a request that failed
 * before its answer was read never checked the response.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { requestChecks } from "@/features/requests/request-checks";
import { useStudioStore } from "@/store";
import type { EventType, StudioEvent } from "@/store/types";

type Event = StudioEvent & Record<string, unknown>;

function event(type: EventType, fields: Record<string, unknown> = {}): Event {
  return {
    id: "r1",
    type,
    timestamp: Date.now(),
    sessionId: "demo-server",
    requestId: "r1",
    ...fields,
  };
}

const START = event("request:start", {
  source: "api",
  group: "posts",
  method: "get",
  mode: "proxy",
  middlewareCount: 0,
  hasValidation: { variables: true, response: true },
});

function checked(events: Event[]): string[] {
  useStudioStore.getState().handleEvents(events);
  const request = useStudioStore.getState().requests.find((r) => r.id === "r1");
  if (!request) throw new Error("the request is not in the store");
  return requestChecks(request)
    .slice(0, 2)
    .map((check) => `${check.label} · ${check.detail}`);
}

beforeEach(() => {
  useStudioStore.setState({ requests: [] });
});

describe("the validation a request's checks show", () => {
  it("is passed for what the request validated", () => {
    const checks = checked([
      START,
      event("validation:pass", { target: "variables" }),
      event("validation:pass", { target: "response" }),
      event("request:end", { status: 200, data: {} }),
    ]);

    expect(checks).toEqual([
      "Variables validated · Matched the input schema",
      "Response validated · Matched the response schema",
    ]);
  });

  it("is not run for a response the request never read", () => {
    const checks = checked([
      START,
      event("validation:pass", { target: "variables" }),
      event("request:error", {
        status: 500,
        error: { type: "http", status: 500, message: "HTTP 500" },
      }),
    ]);

    expect(checks).toEqual([
      "Variables validated · Matched the input schema",
      "Response not validated · Skipped · no response to check",
    ]);
  });

  it("is failed for what the schema refused", () => {
    const checks = checked([
      START,
      event("validation:fail", {
        target: "variables",
        issues: [{ message: "Required", path: ["id"] }],
      }),
      event("request:error", { error: { type: "validation", message: "Validation failed" } }),
    ]);

    expect(checks).toEqual([
      "Variables rejected · Refused by the input schema; nothing was sent",
      "Response not validated · Skipped · no response to check",
    ]);
  });
});
