/**
 * Tests for `forwardConnectionStatus` — the exhaustive helper that drives
 * status propagation in `executeWSPush` and `executeWSChannel`. Centralizing
 * the switch fixes the regression class where one call site forgot to
 * forward `"reconnecting"` and the Studio Playground watchdog hung in
 * `"connecting"` forever.
 */

import { describe, expect, it, vi } from "vitest";

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

  it("invokes onDisconnected AFTER setting state to disconnected", () => {
    const state = createConnectionState("connected");
    const seen: string[] = [];
    state.subscribe((s) => seen.push(`state:${s}`));
    const onDisconnected = vi.fn(() => seen.push("cb"));
    forwardConnectionStatus(state, "disconnected", onDisconnected);
    expect(onDisconnected).toHaveBeenCalledOnce();
    expect(seen).toEqual(["state:disconnected", "cb"]);
  });

  it("does not invoke onDisconnected for non-disconnected statuses", () => {
    const state = createConnectionState();
    const onDisconnected = vi.fn();
    forwardConnectionStatus(state, "connecting", onDisconnected);
    forwardConnectionStatus(state, "connected", onDisconnected);
    forwardConnectionStatus(state, "reconnecting", onDisconnected);
    expect(onDisconnected).not.toHaveBeenCalled();
  });
});
