/**
 * @vitest-environment jsdom
 *
 * A request's General tab says how its validation ended, not only that its
 * endpoint declares a schema: a request that failed before its answer was
 * read never checked the response.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GeneralTab } from "@/components/shared/detail-panel/tabs/general-tab";
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

function shown(events: Event[]): void {
  useStudioStore.getState().handleEvents(events);
  const request = useStudioStore.getState().requests.find((r) => r.id === "r1");
  if (!request) throw new Error("the request is not in the store");
  render(<GeneralTab request={request} />);
}

function validationShown(label: string): string | null | undefined {
  return screen.getByText(label).parentElement?.lastElementChild?.textContent;
}

beforeEach(() => {
  useStudioStore.setState({ requests: [] });
});

afterEach(cleanup);

describe("the validation a request's General tab shows", () => {
  it("is passed for what the request validated", () => {
    shown([
      START,
      event("validation:pass", { target: "variables" }),
      event("validation:pass", { target: "response" }),
      event("request:end", { status: 200, data: {} }),
    ]);

    expect(validationShown("Variables Validated")).toBe("Passed");
    expect(validationShown("Response Validated")).toBe("Passed");
  });

  it("is not run for a response the request never read", () => {
    shown([
      START,
      event("validation:pass", { target: "variables" }),
      event("request:error", {
        status: 500,
        error: { type: "http", status: 500, message: "HTTP 500" },
      }),
    ]);

    expect(validationShown("Variables Validated")).toBe("Passed");
    expect(validationShown("Response Validated")).toBe("Not run");
  });

  it("is failed for what the schema refused", () => {
    shown([
      START,
      event("validation:fail", {
        target: "variables",
        issues: [{ message: "Required", path: ["id"] }],
      }),
      event("request:error", { error: { type: "validation", message: "Validation failed" } }),
    ]);

    expect(validationShown("Variables Validated")).toBe("Failed");
    expect(validationShown("Response Validated")).toBe("Not run");
  });
});
