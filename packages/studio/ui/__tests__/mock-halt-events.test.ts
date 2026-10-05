/**
 * A mock's run halted by a stop condition, as the page hears of it: the
 * mock's experiment event, that it halted, then the settings it kept. The
 * halt is logged once, with its reason and how long the run lasted, the
 * presets end, and the thresholds that halted it stay on.
 */
import { afterEach, describe, expect, it } from "vitest";

import { handleMockEvent } from "../src/store/handle-mock-events";
import { useMockStore } from "../src/store/mock-slice";

const LIMITS = {
  enabled: true,
  errorRateThreshold: 50,
  errorRateDurationSecs: 30,
  p99Threshold: 0,
  p99DurationSecs: 60,
  maxDurationMins: 0,
};

afterEach(() => {
  useMockStore.getState().resetMockState();
});

describe("a mock's run halted by a stop condition", () => {
  it("is logged once, and leaves no preset but the thresholds that halted it", () => {
    handleMockEvent({ type: "mock:server:connect", serverId: "api", id: "e1", timestamp: 1 });
    useMockStore.getState().updateServer("api", { chaosPreset: "down", latencyPreset: "3g" });

    handleMockEvent({
      type: "mock:experiment:event",
      serverId: "api",
      eventType: "auto-halted",
      mode: "chaos",
      reason: "error rate 100% > 50%",
      errorRate: 0,
      durationMs: 4_000,
    });
    handleMockEvent({
      type: "mock:network:config",
      serverId: "api",
      config: { autoHalted: true, haltReason: "error rate 100% > 50%" },
    });
    handleMockEvent({
      type: "mock:network:config",
      serverId: "api",
      config: { latency: 0, errorRate: 0, faultWeights: [], stopConditions: LIMITS },
    });

    const { experimentHistory, servers } = useMockStore.getState();
    expect(experimentHistory).toHaveLength(1);
    expect(experimentHistory[0]).toMatchObject({
      type: "auto-halted",
      reason: "error rate 100% > 50%",
      durationMs: 4_000,
    });
    expect(servers.api).toMatchObject({ chaosPreset: "none", latencyPreset: "none" });
    expect(servers.api?.networkConfig?.stopConditions).toEqual(LIMITS);
  });
});
