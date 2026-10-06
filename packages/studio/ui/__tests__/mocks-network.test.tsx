/**
 * @vitest-environment jsdom
 *
 * The mock's Network tab: the condition it serves under, a chaos mode
 * picked and a rate dragged — each sent as the share the mock reads — the
 * fault mix grown from the catalogue and cut back, a latency preset and a
 * base and jitter of one's own, a download cap, an upload speed, size limit
 * and types, a route's own override — its faults and upload rules included —
 * sent with the ones the mock already held, the thresholds that halt a run,
 * the log of runs, Stop — which switches the route overrides off and clears
 * the upload conditions too — and a stopped mock.
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

/*
 * Radix opens a menu on a primary pointer press. A click focuses its button
 * first; without that, jsdom fires `blur` on the window as focus leaves the
 * document for the menu, and Radix closes a menu on the window's blur.
 */
async function openMenu(name: string | RegExp): Promise<void> {
  const button = screen.getByRole("button", { name });
  await settle(() => button.focus());
  await settle(() =>
    fireEvent.pointerDown(button, { button: 0, ctrlKey: false, pointerType: "mouse" }),
  );
}

/* Typed into a field as a person does: focused, changed, and let go with Enter. */
async function typeInto(field: HTMLElement, value: string): Promise<void> {
  await settle(() => field.focus());
  await settle(() => fireEvent.change(field, { target: { value } }));
  await settle(() => fireEvent.keyDown(field, { key: "Enter" }));
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

describe("the network condition of a mock that only caps or overrides", () => {
  it("names its bandwidth cap and the routes overridden, with a Stop", async () => {
    serve({
      networkConfig: {
        latency: 0,
        errorRate: 0,
        bandwidth: 512,
        routeOverrides: [{ routeId: "users:list", enabled: true, errorRate: 0.5 }],
      },
    });

    await openShell("/mocks/network");

    expect(within(condition()).getByText("512 Kbps cap · 1 route overridden")).toBeTruthy();
    expect(within(condition()).getByRole("button", { name: /Stop/ })).toBeTruthy();
  });
});

describe("the status timeline", () => {
  it("opens the request a cell stands for in its sheet", async () => {
    useMockStore.setState({
      logs: [mockLog({ id: "failed", status: 503, error: "HTTP 503 (simulated)" })],
    });
    const router = await openShell("/mocks/network");

    await settle(() =>
      fireEvent.click(screen.getByRole("button", { name: "Open 503 · /api/users" })),
    );

    expect(router.state.location.search).toMatchObject({ mreq: "failed" });
    expect(screen.getByRole("complementary", { name: "Mock request" })).toBeTruthy();
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
    await drag("Weight of timeout", 40);

    expect(sent("mock:chaos:set").at(-1)).toMatchObject({
      config: {
        errorRate: 0.25,
        faultWeights: [
          { type: "500", weight: 50 },
          { type: "503", weight: 30 },
          { type: "timeout", weight: 40 },
        ],
      },
      preset: "custom",
    });
    expect(screen.getByRole("radio", { name: /Custom/ })).toHaveProperty("checked", true);
  });

  it("adds any error status to the mix from its menu, and takes one out", async () => {
    serve({
      chaosPreset: "custom",
      networkConfig: {
        latency: 0,
        errorRate: 0.3,
        faultWeights: [...PRESET_CONFIG.degraded.faultWeights],
      },
    });
    await openShell("/mocks/network");

    await openMenu("Add a fault");
    await settle(() => fireEvent.click(screen.getByRole("menuitem", { name: /HTTP 413/ })));
    expect(sent("mock:chaos:set").at(-1)).toMatchObject({
      config: {
        errorRate: 0.3,
        faultWeights: [
          { type: "500", weight: 60 },
          { type: "timeout", weight: 40 },
          { type: "413", weight: 20 },
        ],
      },
      preset: "custom",
    });
    expect(screen.getByRole("slider", { name: "Weight of HTTP 413" })).toBeTruthy();

    await settle(() =>
      fireEvent.click(screen.getByRole("button", { name: "Take HTTP 500 out of the mix" })),
    );
    expect(sent("mock:chaos:set").at(-1)).toMatchObject({
      config: {
        faultWeights: [
          { type: "timeout", weight: 40 },
          { type: "413", weight: 20 },
        ],
      },
    });
  });

  it("keeps a mix changed while nothing fails, for when a rate is set", async () => {
    await openShell("/mocks/network");

    await openMenu("Add a fault");
    await settle(() => fireEvent.click(screen.getByRole("menuitem", { name: /HTTP 429/ })));

    expect(sent("mock:chaos:set").at(-1)).toMatchObject({
      config: { errorRate: 0, faultWeights: expect.arrayContaining([{ type: "429", weight: 20 }]) },
      preset: "none",
    });
    expect(screen.getByRole("radio", { name: /Stable/ })).toHaveProperty("checked", true);
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
      config: { latency: { min: 50, max: 550, jitter: 0, distribution: "uniform" } },
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

  it("keeps the jitter within the base, so no delay goes below zero", async () => {
    serve({
      latencyPreset: "custom",
      networkConfig: { latency: { min: 50, max: 550, jitter: 0 }, errorRate: 0 },
    });
    await openShell("/mocks/network");

    await drag("Base delay", 100);

    expect(sent("mock:network:set").at(-1)).toMatchObject({
      config: { latency: { min: 0, max: 200, jitter: 0 } },
    });
    expect(screen.getByRole("slider", { name: "Jitter" })).toHaveProperty("max", "100");
  });

  it("draws a delay of one's own in the shape picked, and offers no shape for a preset", async () => {
    serve({
      latencyPreset: "custom",
      networkConfig: { latency: { min: 280, max: 520, jitter: 0 }, errorRate: 0 },
    });
    await openShell("/mocks/network");
    const shapes = screen.getByRole("group", { name: "Delay shape" });

    await settle(() => fireEvent.click(within(shapes).getByRole("button", { name: "Normal" })));

    expect(sent("mock:network:set").at(-1)).toEqual({
      action: "mock:network:set",
      serverId: "api-mock",
      config: { latency: { min: 280, max: 520, jitter: 0, distribution: "normal" } },
      preset: "custom",
    });
    expect(screen.getByText("Most delays near the base, few at the edges.")).toBeTruthy();
    await settle(() =>
      fireEvent.click(
        within(screen.getByRole("group", { name: "Latency preset" })).getByRole("button", {
          name: "3G",
        }),
      ),
    );
    expect(screen.queryByRole("group", { name: "Delay shape" })).toBeNull();
  });

  it("caps how fast answers are sent", async () => {
    await openShell("/mocks/network");

    await settle(() =>
      fireEvent.click(
        within(screen.getByRole("group", { name: "Download speed" })).getByRole("button", {
          name: "512 Kbps",
        }),
      ),
    );

    expect(sent("mock:network:set")).toEqual([
      { action: "mock:network:set", serverId: "api-mock", config: { bandwidth: 512 } },
    ]);
  });
});

describe("uploads", () => {
  const uploads = () => within(screen.getByRole("region", { name: "Uploads" }));
  const pick = async (group: string, name: string) =>
    settle(() =>
      fireEvent.click(
        within(uploads().getByRole("group", { name: group })).getByRole("button", { name }),
      ),
    );

  it("sets a speed, a size limit and file types, each sent with the ones already set", async () => {
    await openShell("/mocks/network");

    await pick("Upload speed", "1.5 Mbps");
    await pick("Size limit", "1 MB");
    await typeInto(uploads().getByRole("textbox", { name: "File types" }), "image/*, .pdf");

    expect(
      sent("mock:network:set").map((command) => (command as { config: unknown }).config),
    ).toEqual([
      { uploads: { bandwidth: 1_500 } },
      { uploads: { bandwidth: 1_500, maxBytes: 1_048_576 } },
      { uploads: { bandwidth: 1_500, maxBytes: 1_048_576, accept: ["image/*", ".pdf"] } },
    ]);
  });

  it("takes a condition back to none, keeping the others", async () => {
    serve({
      networkConfig: { latency: 0, errorRate: 0, uploads: { bandwidth: 512, maxBytes: 102_400 } },
    });
    await openShell("/mocks/network");

    await pick("Upload speed", "Unlimited");

    expect(sent("mock:network:set").at(-1)).toMatchObject({
      config: { uploads: { maxBytes: 102_400 } },
    });
    expect(sent("mock:network:set").at(-1)).not.toHaveProperty("config.uploads.bandwidth");
  });

  it("does not put back types set elsewhere while the field held focus", async () => {
    serve({ networkConfig: { latency: 0, errorRate: 0, uploads: { accept: ["image/*"] } } });
    await openShell("/mocks/network");
    const field = uploads().getByRole("textbox", { name: "File types" });

    await settle(() => field.focus());
    await settle(() =>
      useMockStore.getState().updateServer("api-mock", {
        networkConfig: { latency: 0, errorRate: 0, uploads: {} },
      }),
    );
    await settle(() => field.blur());

    expect(sent("mock:network:set")).toEqual([]);
    expect((field as HTMLInputElement).value).toBe("");
  });

  it("shows a limit the mocks file set among the presets, chosen", async () => {
    serve({ networkConfig: { latency: 0, errorRate: 0, uploads: { maxBytes: 2_097_152 } } });
    await openShell("/mocks/network");

    const limit = within(uploads().getByRole("group", { name: "Size limit" })).getByRole("button", {
      name: "2 MB",
    });
    expect(limit.getAttribute("aria-pressed")).toBe("true");
  });

  it("are named in the network condition, with a Stop that clears them", async () => {
    serve({
      networkConfig: {
        latency: 0,
        errorRate: 0,
        uploads: { bandwidth: 1_500, maxBytes: 1_048_576, accept: ["image/*"] },
      },
    });
    await openShell("/mocks/network");

    expect(
      within(condition()).getByText("uploads at 1.5 Mbps · up to 1 MB · image/* only"),
    ).toBeTruthy();
    await settle(() => fireEvent.click(within(condition()).getByRole("button", { name: /Stop/ })));
    expect(sent("mock:network:set")).toMatchObject([{ config: { uploads: {} }, preset: "none" }]);
  });
});

describe("a route's own override", () => {
  it("sets its failure rate as a share, alone, switching it on, and switches it off", async () => {
    await openShell("/mocks/network");

    await settle(() => fireEvent.click(screen.getByRole("button", { name: /users\.list/ })));
    await drag("Route error rate", 50);

    expect(sent("mock:network:set").at(-1)).toEqual({
      action: "mock:network:set",
      serverId: "api-mock",
      config: { routeOverrides: [{ routeId: "users:list", enabled: true, errorRate: 0.5 }] },
    });
    const toggle = screen.getByRole("switch", { name: "Override users.list" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    await settle(() => fireEvent.click(toggle));
    expect(sent("mock:network:set").at(-1)).toMatchObject({ config: { routeOverrides: [] } });
  });

  it("keeps the global setting it was given none of, and takes one back on its reset", async () => {
    serve({ networkConfig: { latency: { min: 300, max: 900, jitter: 150 }, errorRate: 0.4 } });
    await openShell("/mocks/network");
    await settle(() => fireEvent.click(screen.getByRole("button", { name: /users\.list/ })));

    /* Both rows' tags, and both settings of the open one, read global; the sliders rest at the global values. */
    expect(screen.getAllByText("global")).toHaveLength(4);
    expect(screen.getAllByDisplayValue("600")).toContain(
      screen.getByRole("slider", { name: "Route delay" }),
    );
    expect(screen.getAllByDisplayValue("40")).toContain(
      screen.getByRole("slider", { name: "Route error rate" }),
    );
    await drag("Route delay", 300);
    expect(sent("mock:network:set").at(-1)).toMatchObject({
      config: {
        routeOverrides: [
          { routeId: "users:list", enabled: true, latency: { min: 300, max: 300, jitter: 0 } },
        ],
      },
    });
    expect(sent("mock:network:set").at(-1)).not.toHaveProperty("config.routeOverrides.0.errorRate");
    await drag("Route error rate", 0);
    await settle(() =>
      fireEvent.click(screen.getByRole("button", { name: "Use the global delay" })),
    );

    expect(sent("mock:network:set").at(-1)).toEqual({
      action: "mock:network:set",
      serverId: "api-mock",
      config: { routeOverrides: [{ routeId: "users:list", enabled: true, errorRate: 0 }] },
    });
    expect(screen.getByRole("button", { name: /users\.list/ }).textContent).toContain("0%");
  });

  it("opens a route switched on with nothing of its own", async () => {
    await openShell("/mocks/network");

    await settle(() =>
      fireEvent.click(screen.getByRole("switch", { name: "Override users.list" })),
    );

    expect(screen.getByRole("slider", { name: "Route delay" })).toBeTruthy();
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

  it("fails with the faults picked, at 100% when nothing would fail it", async () => {
    await openShell("/mocks/network");
    await settle(() => fireEvent.click(screen.getByRole("button", { name: /orders\.create/ })));

    await openMenu("Pick faults");
    await settle(() => fireEvent.click(screen.getByRole("menuitem", { name: /HTTP 413/ })));

    expect(sent("mock:network:set").at(-1)).toEqual({
      action: "mock:network:set",
      serverId: "api-mock",
      config: {
        routeOverrides: [
          { routeId: "orders:create", enabled: true, faultTypes: ["413"], errorRate: 1 },
        ],
      },
    });
    expect(screen.getByRole("button", { name: /orders\.create/ }).textContent).toContain(
      "100% · 413",
    );
    await settle(() => fireEvent.click(screen.getByRole("button", { name: "Take HTTP 413 out" })));
    expect(sent("mock:network:set").at(-1)).toMatchObject({
      config: { routeOverrides: [{ routeId: "orders:create", enabled: true, errorRate: 1 }] },
    });
  });

  it("takes a size limit and file types of its own, each in place of the mock's", async () => {
    await openShell("/mocks/network");
    await settle(() => fireEvent.click(screen.getByRole("button", { name: /orders\.create/ })));

    await settle(() =>
      fireEvent.click(
        within(screen.getByRole("group", { name: "Route size limit" })).getByRole("button", {
          name: "100 KB",
        }),
      ),
    );
    await typeInto(screen.getByRole("textbox", { name: "Route file types" }), ".csv");

    expect(sent("mock:network:set").at(-1)).toEqual({
      action: "mock:network:set",
      serverId: "api-mock",
      config: {
        routeOverrides: [
          {
            routeId: "orders:create",
            enabled: true,
            uploads: { maxBytes: 102_400, accept: [".csv"] },
          },
        ],
      },
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

  it("shows the thresholds the mock holds, and starts a chaos mode under them", async () => {
    const held = { ...DEFAULT_STOP, enabled: true, errorRateThreshold: 50 };
    serve({ networkConfig: { latency: 0, errorRate: 0, stopConditions: held } });
    await openShell("/mocks/network");

    expect(screen.getByRole("switch", { name: "Auto-halt" }).getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(screen.getByText("50% over 30s")).toBeTruthy();
    await settle(() => fireEvent.click(screen.getByRole("radio", { name: /Degraded/ })));

    expect(sent("mock:chaos:set")).toMatchObject([{ config: { stopConditions: held } }]);
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

  it("switches every route override off, keeping what it sets", async () => {
    const override = { routeId: "users:list", enabled: true, errorRate: 0.5 };
    serve({ networkConfig: { latency: 0, errorRate: 0, routeOverrides: [override] } });
    await openShell("/mocks/network");

    await settle(() => fireEvent.click(within(condition()).getByRole("button", { name: /Stop/ })));

    expect(sent("mock:network:set")).toMatchObject([
      { config: { latency: 0, bandwidth: 0, routeOverrides: [] }, preset: "none" },
    ]);
    const toggle = screen.getByRole("switch", { name: "Override users.list" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(useMockStore.getState().servers["api-mock"]?.routeOverrides).toEqual([
      { ...override, enabled: false },
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
