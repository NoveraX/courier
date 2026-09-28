/**
 * @vitest-environment jsdom
 */
/**
 * A custom latency edited on a mock that already runs with a custom
 * latency offers to apply the change, in the component as the React
 * Compiler builds it.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MockServerInfo } from "../src/store/mock-slice";
import { LatencyControls } from "../src/views/mocks/network/latency-controls";

const CUSTOM: MockServerInfo = {
  serverId: "apiMock",
  name: "apiMock",
  port: 7001,
  url: "http://localhost:7001",
  status: "connected",
  startedAt: Date.now(),
  routeCount: 2,
  collectionCount: 1,
  recordCount: 20,
  requestsServed: 0,
  scenarioRequestCount: 0,
  errorCount: 0,
  activeScenario: null,
  availableScenarios: ["happy-path"],
  networkPreset: "none",
  networkConfig: null,
  latencyPreset: "custom",
  chaosPreset: "none",
  managed: true,
  processStatus: "running",
  origin: "studio",
  collections: [],
  routes: [],
  scenarios: [],
};

/* The slider measures its track, which jsdom cannot. */
class NoResize {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", NoResize);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the custom latency of a running mock", () => {
  it("offers to apply an edit", () => {
    render(<LatencyControls server={CUSTOM} />);
    expect(screen.queryByRole("button", { name: /apply/i })).toBeNull();

    const [slider] = screen.getAllByRole("slider");
    if (!slider) throw new Error("no latency slider");
    fireEvent.keyDown(slider, { key: "ArrowRight" });

    expect(screen.getByRole("button", { name: /apply/i })).toBeTruthy();
  });
});
