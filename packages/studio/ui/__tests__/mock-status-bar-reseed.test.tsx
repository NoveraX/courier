/**
 * @vitest-environment jsdom
 */
/**
 * The status bar's re-seed restores the seeding the mock declares, not a
 * count of 20 the mock would apply to every collection: a mock declared with
 * `seed: { count: 6, pets: 25 }` comes back as declared, not with 20 of
 * each.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "../src/components/ui/tooltip";
import type { MockServerInfo } from "../src/store/mock-slice";
import { StatusBar } from "../src/views/mocks/dashboard/status-bar";

const emit = vi.hoisted(() => vi.fn());
vi.mock("@/socket", () => ({ getSocket: () => ({ emit }) }));

afterEach(() => {
  cleanup();
  emit.mockReset();
});

const RUNNING: MockServerInfo = {
  serverId: "apiMock",
  name: "apiMock",
  port: 7001,
  url: "http://localhost:7001",
  status: "connected",
  startedAt: Date.now(),
  routeCount: 2,
  collectionCount: 2,
  recordCount: 31,
  requestsServed: 0,
  scenarioRequestCount: 0,
  errorCount: 0,
  activeScenario: null,
  availableScenarios: ["happy-path"],
  networkPreset: "none",
  networkConfig: null,
  latencyPreset: "none",
  chaosPreset: "none",
  managed: true,
  processStatus: "running",
  origin: "studio",
  collections: [],
  routes: [],
  scenarios: [],
};

describe("the status bar's re-seed", () => {
  it("asks the mock to seed every collection as it declares, sending no count", () => {
    render(
      <TooltipProvider>
        <StatusBar server={RUNNING} />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Re-seed all collections" }));

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith("mock:command", {
      action: "mock:store:seed",
      serverId: "apiMock",
      collection: "*",
    });
  });
});
