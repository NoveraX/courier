/**
 * What halts a mock's run of simulated faults and delays: the error rate or
 * the p99 over a window, and the run's longest length. A mock halts on them
 * wherever it runs — on its own as well as in Studio — and a run that ends
 * at its longest length ends on time, with no answer to notice it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createNetworkState } from "../../src/network/state";
import type { TrackedAnswer } from "../../src/network/stop-conditions";
import { crossedStopCondition } from "../../src/network/stop-conditions";
import { createMockServer } from "../../src/server/create-mock-server";
import type { StopCondition } from "../../src/types";

const OFF: StopCondition = {
  enabled: true,
  errorRateThreshold: 0,
  errorRateDurationSecs: 30,
  p99Threshold: 0,
  p99DurationSecs: 60,
  maxDurationMins: 0,
};

const NOW = 1_000_000;

function answers(count: number, answer: Omit<TrackedAnswer, "time">): TrackedAnswer[] {
  return Array.from({ length: count }, () => ({ time: NOW - 1000, ...answer }));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("the stop condition a run crosses", () => {
  it("is its error rate once the window holds five answers, and not before", () => {
    const conditions = { ...OFF, errorRateThreshold: 50 };
    const failing = { duration: 5, error: true };

    expect(crossedStopCondition(conditions, NOW - 5000, answers(4, failing), NOW)).toBeUndefined();
    expect(crossedStopCondition(conditions, NOW - 5000, answers(5, failing), NOW)).toBe(
      "error rate 100% > 50%",
    );
  });

  it("is its p99 once the window holds ten answers, and not before", () => {
    const conditions = { ...OFF, p99Threshold: 1000 };
    const slow = { duration: 1500, error: false };

    expect(crossedStopCondition(conditions, NOW - 5000, answers(9, slow), NOW)).toBeUndefined();
    expect(crossedStopCondition(conditions, NOW - 5000, answers(10, slow), NOW)).toBe(
      "P99 1500ms > 1000ms",
    );
  });

  it("weighs only the answers within its window", () => {
    const conditions = { ...OFF, errorRateThreshold: 50, errorRateDurationSecs: 10 };
    const old = answers(5, { duration: 5, error: true }).map((a) => ({ ...a, time: NOW - 20_000 }));

    expect(crossedStopCondition(conditions, NOW - 30_000, old, NOW)).toBeUndefined();
  });

  it("is its longest length once that has passed", () => {
    const conditions = { ...OFF, maxDurationMins: 2 };

    expect(crossedStopCondition(conditions, NOW - 119_000, [], NOW)).toBeUndefined();
    expect(crossedStopCondition(conditions, NOW - 120_000, [], NOW)).toBe("max duration (2min)");
  });
});

describe("a run that crosses a stop condition", () => {
  it("halts a mock server run on its own, which then answers as declared", async () => {
    const server = createMockServer({
      log: false,
      network: {
        errorRate: 1,
        faultTypes: ["500"],
        stopConditions: { ...OFF, errorRateThreshold: 50 },
      },
    });
    server.mock("users", "list").resolves([{ id: 1 }]);
    const halted = vi.fn();
    server.networkState.onHalt = halted;

    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await server.app.request("/api/users/list")).status);

    expect(statuses).toEqual([500, 500, 500, 500, 500, 200]);
    expect(halted).toHaveBeenCalledOnce();
    expect(halted.mock.calls[0]?.[0]).toMatchObject({ reason: "error rate 100% > 50%" });
    expect(server.networkState.getGlobalConfig()).toEqual({
      stopConditions: { ...OFF, errorRateThreshold: 50 },
    });
  });

  it("clears what it simulated, presets included, and keeps what halts it", () => {
    const state = createNetworkState({
      errorRate: 0.5,
      latency: { min: 10, max: 20 },
      stopConditions: { ...OFF, p99Threshold: 100 },
    });
    state.latencyPreset = "3g";
    state.chaosPreset = "degraded";

    for (let i = 0; i < 10; i++) state.trackRequest(250, false);

    expect(state.getGlobalConfig()).toEqual({ stopConditions: { ...OFF, p99Threshold: 100 } });
    expect(state.startedAt).toBeNull();
    expect(state.latencyPreset).toBe("none");
    expect(state.chaosPreset).toBe("none");
  });

  it("switches the route overrides off, each keeping its settings", () => {
    const state = createNetworkState({
      errorRate: 0.5,
      routeOverrides: [
        { routeId: "users:list", enabled: true, errorRate: 1 },
        { routeId: "files:upload", enabled: false, uploads: { maxBytes: 1024 } },
      ],
      stopConditions: { ...OFF, p99Threshold: 100 },
    });

    for (let i = 0; i < 10; i++) state.trackRequest(250, false);

    expect(state.getGlobalConfig()).toEqual({
      stopConditions: { ...OFF, p99Threshold: 100 },
      routeOverrides: [
        { routeId: "users:list", enabled: false, errorRate: 1 },
        { routeId: "files:upload", enabled: false, uploads: { maxBytes: 1024 } },
      ],
    });
    expect(state.getConfig("users", "list")?.errorRate).toBeUndefined();
    expect(state.startedAt).toBeNull();
  });

  it("ends at its longest length on time, though no answer comes", () => {
    vi.useFakeTimers();
    const state = createNetworkState({
      errorRate: 0.5,
      stopConditions: { ...OFF, maxDurationMins: 1 },
    });
    const halted = vi.fn();
    state.onHalt = halted;

    vi.advanceTimersByTime(59_999);
    expect(halted).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(halted).toHaveBeenCalledWith({ reason: "max duration (1min)", durationMs: 60_000 });
    expect(state.getGlobalConfig()).toEqual({ stopConditions: { ...OFF, maxDurationMins: 1 } });
  });

  it("halts the next run by the same conditions", () => {
    vi.useFakeTimers();
    const state = createNetworkState({
      errorRate: 0.5,
      stopConditions: { ...OFF, maxDurationMins: 1 },
    });
    const halted = vi.fn();
    state.onHalt = halted;
    vi.advanceTimersByTime(60_000);

    state.mergeConfig({ latency: { min: 100, max: 200 } });
    vi.advanceTimersByTime(60_000);

    expect(halted).toHaveBeenCalledTimes(2);
    expect(state.getGlobalConfig()?.latency).toBeUndefined();
  });

  it("measures its longest length from when it started, though its limits change", () => {
    vi.useFakeTimers();
    const state = createNetworkState({ errorRate: 0.5 });
    const halted = vi.fn();
    state.onHalt = halted;

    vi.advanceTimersByTime(90_000);
    state.mergeConfig({ stopConditions: { ...OFF, maxDurationMins: 2 } });
    vi.advanceTimersByTime(29_999);
    expect(halted).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(halted).toHaveBeenCalledWith({ reason: "max duration (2min)", durationMs: 120_000 });
  });

  it("is one that fails or delays only routes of its own, or only caps bandwidth", () => {
    const failing = createNetworkState();
    const capped = createNetworkState();
    failing.mergeConfig({
      routeOverrides: [{ routeId: "users:list", enabled: true, errorRate: 1 }],
      stopConditions: { ...OFF, errorRateThreshold: 50 },
    });
    capped.mergeConfig({ bandwidth: 512, stopConditions: { ...OFF, p99Threshold: 100 } });

    for (let i = 0; i < 5; i++) failing.trackRequest(5, true);
    for (let i = 0; i < 10; i++) capped.trackRequest(250, false);

    expect(failing.getGlobalConfig()?.routeOverrides).toEqual([
      { routeId: "users:list", enabled: false, errorRate: 1 },
    ]);
    expect(failing.getConfig("users", "list")?.errorRate).toBeUndefined();
    expect(capped.getGlobalConfig()?.bandwidth).toBeUndefined();
  });

  it("does not start for limits alone, with nothing simulated", () => {
    vi.useFakeTimers();
    const state = createNetworkState({ stopConditions: { ...OFF, maxDurationMins: 1 } });
    const halted = vi.fn();
    state.onHalt = halted;

    vi.advanceTimersByTime(120_000);

    expect(state.startedAt).toBeNull();
    expect(halted).not.toHaveBeenCalled();
  });

  it("does not end once its settings are cleared", () => {
    vi.useFakeTimers();
    const state = createNetworkState({
      errorRate: 0.5,
      stopConditions: { ...OFF, maxDurationMins: 1 },
    });
    const halted = vi.fn();
    state.onHalt = halted;

    state.setConfig(undefined);
    vi.advanceTimersByTime(120_000);

    expect(halted).not.toHaveBeenCalled();
  });
});
