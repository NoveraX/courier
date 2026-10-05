/**
 * @vitest-environment jsdom
 *
 * The icon-only buttons that run a mock — start, restart, stop — say what
 * they do to a screen reader and to keyboard users, not only in a tooltip
 * that opens on hover, and only a mock Studio runs offers them.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/mocks/manage-mock", () => ({ manageMock: vi.fn() }));

import { manageMock } from "@/mocks/manage-mock";
import { ServerPill } from "@/screens/mocks/server-pill";
import type { MockServerInfo } from "@/store/mock-slice";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

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

describe("a mock server's controls", () => {
  it("name the start button of a stopped mock", () => {
    const stopped = { ...RUNNING, processStatus: "stopped" as const };
    render(<ServerPill server={stopped} servers={[stopped]} />);

    screen.getByRole("button", { name: "Start the mock server" }).click();

    expect(manageMock).toHaveBeenCalledWith("apiMock", "start");
  });

  it("name the restart and stop buttons of a running mock", () => {
    render(<ServerPill server={RUNNING} servers={[RUNNING]} />);

    expect(screen.getByRole("button", { name: "Restart the mock server" })).toBeTruthy();
    screen.getByRole("button", { name: "Stop the mock server" }).click();

    expect(manageMock).toHaveBeenCalledWith("apiMock", "stop");
  });

  it("are not offered for a mock Studio does not run", () => {
    render(<ServerPill server={{ ...RUNNING, managed: false }} servers={[RUNNING]} />);

    expect(screen.queryByRole("button", { name: /mock server$/ })).toBeNull();
  });
});
