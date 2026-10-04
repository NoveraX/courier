/**
 * @vitest-environment jsdom
 *
 * A failed request keeps the size of the error body it showed and how a
 * proxied call's time split, so its row, the Explorer's sizes and the Timing
 * tab's flow read it as they read a success.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { useStudioStore } from "@/store";
import type { EventType, StudioEvent } from "@/store/types";

type Event = StudioEvent & Record<string, unknown>;

function event(type: EventType, fields: Record<string, unknown> = {}): Event {
  return { id: "r1", type, timestamp: 1, sessionId: "demo-server", requestId: "r1", ...fields };
}

beforeEach(() => {
  useStudioStore.setState({ requests: [] });
});

describe("a request that failed", () => {
  it("keeps the size of its error body and its proxy split, with the browser's legs", () => {
    useStudioStore.getState().handleEvents([
      event("request:start", { source: "api", group: "posts", method: "broken", mode: "proxy" }),
      event("request:error", {
        status: 500,
        error: { type: "http", status: 500, message: "HTTP 500" },
        size: 31,
        proxyTiming: {
          clientToProxy: 0,
          proxyToBackend: 0.2,
          backendToProxy: 2.1,
          proxyToClient: 0,
        },
      }),
      event("proxy:client-timing", { networkLatency: 10, download: 0.1, totalRoundTrip: 12 }),
    ]);

    const request = useStudioStore.getState().requests[0];
    expect(request?.size).toBe(31);
    expect(request?.proxyTiming).toEqual({
      clientToProxy: 10,
      proxyToBackend: 0.2,
      backendToProxy: 2.1,
      proxyToClient: 0.1,
    });
  });
});
