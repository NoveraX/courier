/**
 * @vitest-environment jsdom
 */
/**
 * The icon-only buttons that run a mock — start, restart, stop, re-seed,
 * reset, clear, stop faults — say what they do to a screen reader and to
 * keyboard users, not only in a tooltip that opens on hover.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MockServerInfo } from "../src/store/mock-slice";

import { TooltipProvider } from "../src/components/ui/tooltip";
import { StatusBar } from "../src/views/mocks/dashboard/status-bar";
import { ServerControls } from "../src/views/mocks/shared/server-controls";
import { CollectionItem } from "../src/views/mocks/store/collection-item";

vi.mock("@/socket", () => ({ getSocket: () => ({ emit: vi.fn() }) }));

afterEach(cleanup);

const RUNNING: MockServerInfo = {
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
  networkPreset: "3g",
  networkConfig: null,
  latencyPreset: "3g",
  chaosPreset: "none",
  managed: true,
  processStatus: "running",
  origin: "studio",
  collections: [],
  routes: [],
  scenarios: [],
};

describe("mock server controls", () => {
  it("names the start button of a stopped mock", () => {
    render(
      <TooltipProvider>
        <ServerControls serverId="apiMock" processStatus="stopped" managed />
      </TooltipProvider>,
    );

    expect(screen.getByRole("button", { name: "Start server" })).toBeTruthy();
  });

  it("names the restart and stop buttons of a running mock", () => {
    render(
      <TooltipProvider>
        <ServerControls serverId="apiMock" processStatus="running" managed />
      </TooltipProvider>,
    );

    expect(screen.getByRole("button", { name: "Restart server" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Stop server" })).toBeTruthy();
  });
});

describe("mock status bar", () => {
  it("names its re-seed, reset and stop-faults buttons", () => {
    render(
      <TooltipProvider>
        <StatusBar server={RUNNING} />
      </TooltipProvider>,
    );

    expect(screen.getByRole("button", { name: "Re-seed all collections" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reset store" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Stop all faults" })).toBeTruthy();
  });
});

describe("mock store collection row", () => {
  it("names its re-seed and clear buttons after the collection", () => {
    render(
      <TooltipProvider>
        <CollectionItem
          name="users"
          count={20}
          isActive={false}
          onSelect={vi.fn()}
          onSeed={vi.fn()}
          onClear={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(screen.getByRole("button", { name: "Re-seed users", hidden: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clear users", hidden: true })).toBeTruthy();
  });
});
