/**
 * @vitest-environment jsdom
 *
 * The HTTP version a request went over, as its runtime tells it with the
 * fetch's answer: kept on the request, through a saved session and back,
 * and nothing kept for a version that is none.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { requestFromSaved, savedRequestOf } from "@/features/sessions/saved-request";
import { useStudioStore } from "@/store";
import type { EventType, StudioEvent } from "@/store/types";

type Event = StudioEvent & Record<string, unknown>;

function event(type: EventType, fields: Record<string, unknown> = {}): Event {
  return { id: "r1", type, timestamp: 1, sessionId: "next-server", requestId: "r1", ...fields };
}

function answered(httpVersion: unknown): void {
  useStudioStore
    .getState()
    .handleEvents([
      event("request:start", { source: "api", group: "users", method: "list", mode: "direct" }),
      event("http:fetch:start", { url: "https://api.example.com/users", method: "GET" }),
      event("http:fetch:end", { status: 200, duration: 3, httpVersion }),
    ]);
}

beforeEach(() => {
  useStudioStore.setState({ requests: [], heldRequests: [], paused: false });
});

describe("the HTTP version of a request", () => {
  it("is kept as the runtime told it with the answer", () => {
    answered("HTTP/2");

    expect(useStudioStore.getState().requests[0]?.httpVersion).toBe("HTTP/2");
  });

  it("is left unknown when what was told is no version", () => {
    answered("SPDY/3");

    const [request] = useStudioStore.getState().requests;
    expect(request).toBeDefined();
    expect(request?.httpVersion).toBeUndefined();
  });

  it("comes back with a saved session", () => {
    answered("HTTP/3");
    const [request] = useStudioStore.getState().requests;

    const restored = request ? requestFromSaved(savedRequestOf(request)) : undefined;

    expect(restored?.httpVersion).toBe("HTTP/3");
  });
});
