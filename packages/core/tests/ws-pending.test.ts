import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPendingRegistry } from "../src/realtime/ws/ws-pending";

describe("createPendingRegistry", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("registers and resolves a request", () => {
    const registry = createPendingRegistry();
    let result: unknown;
    const id = registry.register((v) => { result = v; }, vi.fn(), 5000);

    registry.resolve({ type: "data", id, payload: "ok" });

    expect(result).toBe("ok");
    expect(registry.has(id)).toBe(false);
  });

  it("registers and rejects a request", () => {
    const registry = createPendingRegistry();
    let error: Error | undefined;
    const id = registry.register(vi.fn(), (e) => { error = e; }, 5000);

    registry.reject({ type: "error", id, error: { code: 500, message: "fail" } });

    expect(error?.message).toBe("fail");
  });

  it("times out pending request", () => {
    const registry = createPendingRegistry();
    let error: Error | undefined;
    const id = registry.register(vi.fn(), (e) => { error = e; }, 1000);

    vi.advanceTimersByTime(1001);

    expect(error?.message).toContain("timeout");
    expect(registry.has(id)).toBe(false);
  });

  it("rejectAll rejects all pending requests", () => {
    const registry = createPendingRegistry();
    const errors: Error[] = [];
    registry.register(vi.fn(), (e) => errors.push(e), 5000);
    registry.register(vi.fn(), (e) => errors.push(e), 5000);

    registry.rejectAll("closed");

    expect(errors).toHaveLength(2);
    expect(errors[0]!.message).toBe("closed");
  });

  it("has returns true for registered id", () => {
    const registry = createPendingRegistry();
    const id = registry.register(vi.fn(), vi.fn(), 5000);

    expect(registry.has(id)).toBe(true);
  });

  it("resolve returns false for unknown id", () => {
    const registry = createPendingRegistry();

    expect(registry.resolve({ type: "data", id: "nope", payload: null })).toBe(false);
  });

  it("reject returns false for missing id field", () => {
    const registry = createPendingRegistry();

    expect(registry.reject({ type: "error" })).toBe(false);
  });
});
