/**
 * @vitest-environment jsdom
 *
 * The runtime that made a proxied call: the proxy records the call first,
 * under its own runtime, and the caller names itself with the timing it
 * reports — so the route and the request's runtime name the caller, not
 * the proxy.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { requestFromSaved, savedRequestOf } from "@/features/sessions/saved-request";
import { useStudioStore } from "@/store";
import type { EventType, StudioEvent } from "@/store/types";

type Event = StudioEvent & Record<string, unknown>;

function event(type: EventType, sessionId: string, fields: Record<string, unknown> = {}): Event {
  return { id: "r1", type, timestamp: 1, sessionId, requestId: "r1", ...fields };
}

beforeEach(() => {
  useStudioStore.setState({ requests: [], heldRequests: [], paused: false });
});

describe("a proxied call's caller", () => {
  it("is the runtime that timed its legs, though the proxy recorded the call", () => {
    useStudioStore
      .getState()
      .handleEvents([
        event("request:start", "next-server", { source: "api", method: "list", mode: "proxy" }),
        event("proxy:client-timing", "vite-browser", { networkLatency: 4, download: 1 }),
      ]);

    const [request] = useStudioStore.getState().requests;
    expect(request?.sessionId).toBe("next-server");
    expect(request?.callerRuntimeId).toBe("vite-browser");
  });

  it("comes back with a saved session", () => {
    useStudioStore
      .getState()
      .handleEvents([
        event("request:start", "next-server", { source: "api", method: "list", mode: "proxy" }),
        event("proxy:client-timing", "vite-browser", { networkLatency: 4, download: 1 }),
      ]);
    const [request] = useStudioStore.getState().requests;

    const restored = request ? requestFromSaved(savedRequestOf(request)) : undefined;

    expect(restored?.callerRuntimeId).toBe("vite-browser");
  });
});
