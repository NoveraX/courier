/**
 * @vitest-environment jsdom
 *
 * The mock's Network tab: the condition it serves under, a chaos mode
 * picked and a rate dragged — each sent as the share the mock reads — a
 * latency preset and a base and jitter of one's own, a bandwidth cap, a
 * route's own override sent with the ones the mock already held, the
 * thresholds that halt a run, the log of runs, Stop, and a stopped mock.
 */
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const emit = vi.hoisted(() => vi.fn());

vi.mock("@/socket", () => ({
  getSocket: () => ({
    emit,
    on: vi.fn(),
    off: vi.fn(),
    connect: vi.fn(),
    timeout: () => ({ emit: vi.fn() }),
  }),
}));

import { DEFAULT_STOP, PRESET_CONFIG } from "@/features/mocks/chaos-config";
import { useStudioStore } from "@/store";
import type { MockRouteEntry, MockServerInfo } from "@/store/mock-slice";
import { useMockStore } from "@/store/mock-slice";
import { mockLog, mockServer } from "./mock-server-fixture";
import { openShell } from "./shell-harness";

const ROUTES: MockRouteEntry[] = [
  {
    group: "users",
    endpoint: "list",
    httpMethod: "get",
    path: "/users",
    fullPath: "/api/users",
    source: "auto",
    hits: 0,
    avgLatency: 0,
  },
  {
    group: "orders",
    endpoint: "create",
    httpMethod: "post",
    path: "/orders",
    fullPath: "/api/orders",
    source: "auto",
    hits: 0,
    avgLatency: 0,
  },
];

async function settle(interaction: () => void): Promise<void> {
  await act(async () => {
    interaction();
  });
}

async function drag(name: string, value: number): Promise<void> {
  const slider = screen.getByRole("slider", { name });
  await settle(() => fireEvent.change(slider, { target: { value: String(value) } }));
  await settle(() => fireEvent.pointerUp(slider));
}

function sent(action: string): unknown[] {
  return emit.mock.calls
    .filter(([event, payload]) => event === "mock:command" && payload.action === action)
    .map(([, payload]) => payload);
}

function serve(fields: Partial<MockServerInfo> = {}): void {
  useMockStore.setState({
    servers: { "api-mock": mockServer({ routes: ROUTES, ...fields }) },
    activeServerId: "api-mock",
  });
}

const condition = () => screen.getByRole("region", { name: "Network condition" });

beforeEach(() => {
  useStudioStore.setState({
    connected: true,
    connectionStatus: "connected",
    requests: [],
    heldRequests: [],
  });
  useMockStore.setState({ logs: [], experimentHistory: [] });
  serve();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("the network condition", () => {
  it("says a mock without chaos or delay is stable, and counts only the faults chaos injected", async () => {
    useMockStore.setState({
      logs: [
        mockLog({ id: "a", status: 503, error: "HTTP 503 (simulated)" }),
        mockLog({ id: "b", status: 500, error: "Internal error" }),
      ],
    });

    await openShell("/mocks/network");

    expect(within(condition()).getByText("Stable")).toBeTruthy();
    expect(
      within(condition()).getByText("Handlers respond normally with no added delay"),
    ).toBeTruthy();
    const faults = within(screen.getByRole("region", { name: "Observed" }));
    expect(faults.getByText("503").nextElementSibling?.textContent).toBe("1");
    expect(faults.getByText("500").nextElementSibling?.textContent).toBe("0");
  });
});

describe("chaos", () => {
  it("picks a mode, sending its rate as the share the mock reads", async () => {
    await openShell("/mocks/network");

    await settle(() => fireEvent.click(screen.getByRole("radio", { name: /Degraded/ })));

    expect(sent("mock:chaos:set")).toEqual([
      {
        action: "mock:chaos:set",
        serverId: "api-mock",
        config: {
          errorRate: 0.1,
          faultWeights: PRESET_CONFIG.degraded.faultWeights,
          stopConditions: DEFAULT_STOP,
        },
        preset: "degraded",
      },
    ]);
    expect(within(condition()).getByText("Degraded")).toBeTruthy();
    expect(within(condition()).getByText("10% of responses faulted")).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Degraded/ })).toHaveProperty("checked", true);
  });

  it("turns a dragged rate or fault mix into a custom run", async () => {
    await openShell("/mocks/network");

    await drag("Error rate", 25);
    expect(sent("mock:chaos:set").at(-1)).toMatchObject({
      config: { errorRate: 0.25 },
      preset: "custom",
    });
    await drag("Weight of reset", 40);

    expect(sent("mock:chaos:set").at(-1)).toMatchObject({
      config: {
        errorRate: 0.25,
        faultWeights: [
          { type: "500", weight: 50 },
          { type: "503", weight: 30 },
          { type: "timeout", weight: 20 },
          { type: "reset", weight: 40 },
        ],
      },
      preset: "custom",
    });
    expect(screen.getByRole("radio", { name: /Custom/ })).toHaveProperty("checked", true);
  });
});

describe("latency", () => {
  it("picks a preset, and shows the window of delays it gives", async () => {
    await openShell("/mocks/network");

    await settle(() =>
      fireEvent.click(
        within(screen.getByRole("group", { name: "Latency preset" })).getByRole("button", {
          name: "3G",
        }),
      ),
    );

    expect(sent("mock:network:set")).toEqual([
      {
        action: "mock:network:set",
        serverId: "api-mock",
        config: { latency: { min: 300, max: 900, jitter: 150, distribution: "log-normal" } },
        preset: "3g",
      },
    ]);
    expect(within(condition()).getByText("Stable · +600ms")).toBeTruthy();
    expect(
      within(screen.getByRole("region", { name: "Latency" })).getByText("150ms – 1.05s"),
    ).toBeTruthy();
  });

  it("sets a base and jitter of one's own, and no delay at a base of zero", async () => {
    serve({
      latencyPreset: "custom",
      networkConfig: { latency: { min: 300, max: 300, jitter: 100 }, errorRate: 0 },
    });
    await openShell("/mocks/network");

    await drag("Jitter", 250);
    expect(sent("mock:network:set").at(-1)).toMatchObject({
      config: { latency: { min: 300, max: 300, jitter: 250 } },
      preset: "custom",
    });
    await drag("Base delay", 0);

    expect(sent("mock:network:set").at(-1)).toMatchObject({
      config: { latency: 0 },
      preset: "none",
    });
    expect(screen.getByText("passthrough")).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Jitter" })).toHaveProperty("disabled", true);
  });

  it("caps how fast bodies are sent", async () => {
    await openShell("/mocks/network");

    await settle(() => fireEvent.click(screen.getByRole("button", { name: "512 Kbps" })));

    expect(sent("mock:network:set")).toEqual([
      { action: "mock:network:set", serverId: "api-mock", config: { bandwidth: 512 } },
    ]);
  });
});

describe("a route's own override", () => {
  it("sets its failure rate as a share, switching it on, and switches it off", async () => {
    await openShell("/mocks/network");

    await settle(() => fireEvent.click(screen.getByRole("button", { name: /users\.list/ })));
    await drag("Route error rate", 50);

    expect(sent("mock:network:set").at(-1)).toEqual({
      action: "mock:network:set",
      serverId: "api-mock",
      config: {
        routeOverrides: [
          {
            routeId: "users:list",
            enabled: true,
            latency: { min: 0, max: 0, jitter: 0 },
            errorRate: 0.5,
          },
        ],
      },
    });
    const toggle = screen.getByRole("switch", { name: "Override users.list" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    await settle(() => fireEvent.click(toggle));
    expect(sent("mock:network:set").at(-1)).toMatchObject({ config: { routeOverrides: [] } });
  });

  it("keeps the overrides the mock already held when another route changes", async () => {
    const held = {
      routeId: "orders:create",
      enabled: true,
      latency: { min: 300, max: 300, jitter: 0 },
    };
    serve({ networkConfig: { latency: 0, errorRate: 0, routeOverrides: [held] } });
    await openShell("/mocks/network");

    await settle(() =>
      fireEvent.click(screen.getByRole("switch", { name: "Override users.list" })),
    );

    expect(sent("mock:network:set").at(-1)).toMatchObject({
      config: { routeOverrides: [held, { routeId: "users:list", enabled: true }] },
    });
  });
});

describe("safety", () => {
  it("halts a run on its own once switched on", async () => {
    await openShell("/mocks/network");

    await settle(() => fireEvent.click(screen.getByRole("switch", { name: "Auto-halt" })));

    expect(sent("mock:network:set")).toEqual([
      {
        action: "mock:network:set",
        serverId: "api-mock",
        config: { stopConditions: { ...DEFAULT_STOP, enabled: true } },
      },
    ]);
  });

  it("logs each run with how long it lasted", async () => {
    const at = Date.now() - 60_000;
    useMockStore.setState({
      experimentHistory: [
        {
          id: "e2",
          serverId: "api-mock",
          type: "stopped",
          mode: "degraded",
          timestamp: at + 42_000,
          errorRate: 0,
        },
        {
          id: "e1",
          serverId: "api-mock",
          type: "started",
          mode: "degraded",
          timestamp: at,
          errorRate: 0,
        },
      ],
    });

    await openShell("/mocks/network");

    const runs = within(screen.getByRole("region", { name: "Runs" }));
    expect(runs.getByText("ran 42s")).toBeTruthy();
    expect(runs.getAllByText("degraded")).toHaveLength(2);
  });
});

describe("Stop and a stopped mock", () => {
  it("stops every fault at once", async () => {
    serve({
      chaosPreset: "down",
      networkConfig: { latency: 0, errorRate: 1, faultWeights: PRESET_CONFIG.down.faultWeights },
    });
    await openShell("/mocks/network");

    await settle(() => fireEvent.click(within(condition()).getByRole("button", { name: /Stop/ })));

    expect(sent("mock:network:set")).toMatchObject([
      { config: { latency: 0, bandwidth: 0 }, preset: "none" },
    ]);
    expect(sent("mock:chaos:set")).toMatchObject([
      { config: { errorRate: 0, faultWeights: [] }, preset: "none" },
    ]);
  });

  it("takes no change while the mock is stopped", async () => {
    serve({ processStatus: "stopped" });
    await openShell("/mocks/network");

    expect(screen.getByRole("radio", { name: /Down/ }).matches(":disabled")).toBe(true);
    expect(screen.getByRole("slider", { name: "Error rate" }).matches(":disabled")).toBe(true);
    expect(screen.getByRole("switch", { name: "Override users.list" })).toHaveProperty(
      "disabled",
      true,
    );
  });
});
