/**
 * Tests for `forwardConnectionStatus` — the exhaustive helper that drives
 * status propagation in `executeWSPush` and `executeWSChannel`. Centralizing
 * the switch fixes the regression class where one call site forgot to
 * forward `"reconnecting"` and the Studio Playground watchdog hung in
 * `"connecting"` forever.
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
