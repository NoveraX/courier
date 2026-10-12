/**
 * @vitest-environment jsdom
 *
 * The mock's scenarios: what each mostly does, its overrides found among the
 * routes, the one on marked Active, another turned on with a command, the
 * scenario open kept in the address — and on a phone shown under its card.
 */
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const emit = vi.hoisted(() => vi.fn());
/* A command sent with an acknowledgement: the test answers it as the mock would. */
const acked = vi.hoisted(() => vi.fn());

vi.mock("@/socket", () => ({
  getSocket: () => ({
    emit,
    on: vi.fn(),
    off: vi.fn(),
    connect: vi.fn(),
    timeout: () => ({ emit: acked }),
  }),
}));

import { scenarioKindOf, scenarioOverrides } from "@/features/mocks/scenario-view";
import { useStudioStore } from "@/store";
import type { MockRouteEntry, MockScenarioEntry } from "@/store/mock-slice";
import { useMockStore } from "@/store/mock-slice";
import { mockServer } from "./mock-server-fixture";
import { openShell } from "./shell-harness";

const ROUTES: MockRouteEntry[] = [
  {
    group: "orders",
    endpoint: "create",
    httpMethod: "post",
    path: "/orders",
    fullPath: "/orders",
    source: "auto",
    hits: 0,
    avgLatency: 0,
  },
];

function scenario(name: string, fields: Partial<MockScenarioEntry> = {}): MockScenarioEntry {
  return {
    name,
    endpointCount: 1,
    isActive: false,
    hasStateMachine: false,
    stateTransitions: [],
    endpoints: [],
    ...fields,
  };
}

const FAILURE = scenario("checkout-failure", {
  description: "Payment declined after the order is created",
  endpoints: [
    {
      group: "orders",
      endpoint: "create",
      httpMethod: "post",
      behavior: "rejects",
      statusCode: 402,
      latency: 300,
    },
  ],
});
const EMPTY = scenario("empty-states", {
  isActive: true,
  endpoints: [{ group: "orders", endpoint: "list", httpMethod: "get", behavior: "returns" }],
});

async function settle(interaction: () => void): Promise<void> {
  await act(async () => {
    interaction();
  });
}

beforeEach(() => {
  useStudioStore.setState({
    connected: true,
    connectionStatus: "connected",
    requests: [],
    heldRequests: [],
  });
  useMockStore.setState({
    servers: {
      "api-mock": mockServer({
        routes: ROUTES,
        scenarios: [EMPTY, FAILURE],
        scenarioRequestCount: 4,
      }),
    },
    activeServerId: "api-mock",
    logs: [],
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("a scenario's data", () => {
  it("says what it mostly does, and finds each override's route", () => {
    expect([
      scenarioKindOf(FAILURE),
      scenarioKindOf(EMPTY),
      scenarioKindOf(scenario("walk", { hasStateMachine: true })),
    ]).toEqual(["failure", "empty", "state"]);
    expect(scenarioOverrides(FAILURE, ROUTES)).toEqual([
      { method: "POST", path: "/orders", result: "rejects 402", tone: "err", delay: 300 },
    ]);
    expect(scenarioOverrides(EMPTY, ROUTES)[0]?.path).toBe("orders.list");
  });
});

describe("the Scenarios tab", () => {
  it("opens on the scenario that is on, with what it answers", async () => {
    await openShell("/mocks/scenarios");

    const open = screen.getByRole("region", { name: "Scenario empty-states" });
    expect(within(open).getByText("4 requests answered since it was turned on")).toBeTruthy();
    expect(within(open).getByText("returns a set answer")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Active" })).toHaveProperty("disabled", true);
  });

  it("opens another scenario, kept in the address, and turns it on", async () => {
    const router = await openShell("/mocks/scenarios");

    await settle(() => fireEvent.click(screen.getByRole("button", { name: /checkout-failure/ })));
    expect(router.state.location.search).toMatchObject({ scenario: "checkout-failure" });
    expect(
      within(screen.getByRole("region", { name: "Scenario checkout-failure" })).getByText("+300ms"),
    ).toBeTruthy();
    acked.mockImplementation((_event, _command, ack) => ack(null, { ok: true }));
    await settle(() => fireEvent.click(screen.getByRole("button", { name: "Activate" })));

    expect(acked).toHaveBeenCalledWith(
      "mock:command",
      { action: "mock:scenario:apply", serverId: "api-mock", scenario: "checkout-failure" },
      expect.any(Function),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says why the mock could not turn a scenario on, the one on staying", async () => {
    acked.mockImplementation((_event, _command, ack) =>
      ack(null, { ok: false, error: "returns() expects a function of the request context" }),
    );
    await openShell("/mocks/scenarios?scenario=checkout-failure");

    await settle(() => fireEvent.click(screen.getByRole("button", { name: "Activate" })));

    expect(screen.getByRole("alert").textContent).toBe(
      "Could not turn it on — returns() expects a function of the request context",
    );
    expect(screen.getByRole("button", { name: "Active" })).toBeTruthy();
  });
});

describe("the Scenarios tab on a phone", () => {
  it("shows the scenario open under its card, and another under its own once tapped", async () => {
    vi.stubGlobal("matchMedia", (media: string) => ({
      media,
      matches: media.includes("max-width: 639px"),
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }));
    await openShell("/mocks/scenarios");
    const cardOf = (region: HTMLElement) => region.previousElementSibling?.textContent ?? "";

    expect(cardOf(screen.getByRole("region", { name: "Scenario empty-states" }))).toContain(
      "empty-states",
    );
    await settle(() => fireEvent.click(screen.getByRole("button", { name: /checkout-failure/ })));

    expect(screen.queryByRole("region", { name: "Scenario empty-states" })).toBeNull();
    expect(cardOf(screen.getByRole("region", { name: "Scenario checkout-failure" }))).toContain(
      "checkout-failure",
    );
  });
});
