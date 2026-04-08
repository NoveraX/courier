import { describe, expect, it, vi } from "vitest";
import { createConnectionState } from "../src/realtime/connection-state";

describe("createConnectionState", () => {
  it("starts with disconnected by default", () => {
    const state = createConnectionState();
    expect(state.current).toBe("disconnected");
  });

  it("accepts custom initial status", () => {
    const state = createConnectionState("connected");
    expect(state.current).toBe("connected");
  });

  it("updates current status on set()", () => {
    const state = createConnectionState();
    state.set("connecting");
    expect(state.current).toBe("connecting");
  });

  it("notifies listeners on status change", () => {
    const state = createConnectionState();
    const listener = vi.fn();

    state.subscribe(listener);
    state.set("connecting");
    state.set("connected");

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenNthCalledWith(1, "connecting");
    expect(listener).toHaveBeenNthCalledWith(2, "connected");
  });

  it("does not notify when status is unchanged", () => {
    const state = createConnectionState();
    const listener = vi.fn();

    state.subscribe(listener);
    state.set("connecting");
    state.set("connecting"); // same — should not fire

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("returns unsubscribe function", () => {
    const state = createConnectionState();
    const listener = vi.fn();

    const unsub = state.subscribe(listener);
    state.set("connecting");
    unsub();
    state.set("connected");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith("connecting");
  });

  it("supports multiple listeners", () => {
    const state = createConnectionState();
    const a = vi.fn();
    const b = vi.fn();

    state.subscribe(a);
    state.subscribe(b);
    state.set("reconnecting");

    expect(a).toHaveBeenCalledWith("reconnecting");
    expect(b).toHaveBeenCalledWith("reconnecting");
  });
});
