/**
 * `forwardConnectionStatus` — the exhaustive switch that drives status
 * propagation in `executeWSPush` and `executeWSChannel`. One switch for both
 * means neither call site can forget a status: a dropped `"reconnecting"`
 * leaves the Studio Playground watchdog waiting at `"connecting"` for good.
 */

import { describe, expect, it } from "vitest";

import { createConnectionState } from "../src/realtime/connection-state";
import { forwardConnectionStatus } from "../src/realtime/forward-status";

describe("forwardConnectionStatus", () => {
  it("forwards every status to the underlying state", () => {
    const state = createConnectionState();
    forwardConnectionStatus(state, "connecting");
    expect(state.current).toBe("connecting");
    forwardConnectionStatus(state, "connected");
    expect(state.current).toBe("connected");
    forwardConnectionStatus(state, "reconnecting");
    expect(state.current).toBe("reconnecting");
    forwardConnectionStatus(state, "disconnected");
    expect(state.current).toBe("disconnected");
  });
});
