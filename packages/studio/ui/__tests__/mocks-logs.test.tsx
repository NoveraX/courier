/**
 * @vitest-environment jsdom
 *
 * The mock's log: what answered each request — chaos, the scenario on, an
 * override, the generated handler — the filters with their counts kept in
 * the address, the search, a request opened in its sheet — what it was
 * answered with, what it sent, its headers and a cURL — Pause, and Clear,
 * which Studio forgets too.
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

import {
  filterCounts,
  logCode,
  logMatches,
  logTag,
  showsIn,
  validateMockLogsSearch,
} from "@/features/mocks/logs-view";
import { useStudioStore } from "@/store";
import { useMockStore } from "@/store/mock-slice";
import { mockLog, mockServer } from "./mock-server-fixture";
import { openShell } from "./shell-harness";

const LOGS = [
  mockLog({
    id: "chaos",
    timestamp: 5,
    path: "/api/orders",
    group: "orders",
    endpoint: "list",
    status: 503,
    error: "HTTP 503 (simulated)",
    duration: 1,
  }),
  mockLog({
    id: "scen",
    timestamp: 4,
    path: "/api/orders",
    group: "orders",
    endpoint: "create",
    httpMethod: "post",
    status: 402,
    source: "scenario",
    data: { error: "payment_required" },
  }),
  mockLog({ id: "over", timestamp: 3, source: "override", data: [{ id: 1 }] }),
  mockLog({
    id: "auto",
    timestamp: 2,
    source: "auto",
    data: [{ id: 2 }],
    variables: { limit: 10 },
  }),
  mockLog({ id: "other", timestamp: 1, serverId: "shop", path: "/shop" }),
];

async function settle(interaction: () => void): Promise<void> {
  await act(async () => {
    interaction();
  });
}

const rows = () =>
  within(screen.getByRole("region", { name: "Requests" })).queryAllByRole("button");
const row = (text: string) => {
  const found = rows().find((button) => button.textContent?.includes(text));
  if (!found) throw new Error(`no row with ${text}`);
  return found;
};

beforeEach(() => {
  useStudioStore.setState({
    connected: true,
    connectionStatus: "connected",
    requests: [],
    heldRequests: [],
  });
  useMockStore.setState({
    servers: { "api-mock": mockServer(), shop: mockServer({ serverId: "shop", name: "shop" }) },
    activeServerId: "api-mock",
    logs: LOGS,
    logsPaused: false,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("a logged request", () => {
  it("is tagged by what answered it, a dropped connection coded RST", () => {
    expect(LOGS.slice(0, 4).map((log) => logTag(log).tag)).toEqual([
      "chaos · 503",
      "scenario",
      "override",
      "handler",
    ]);
    expect(logCode({ status: 502, error: "Connection Reset (simulated)" })).toBe("RST");
    expect(logCode({ status: undefined, error: undefined })).toBe("···");
  });

  it("shows in the filters it belongs to, counted, and matches its path or endpoint", () => {
    expect(filterCounts(LOGS.slice(0, 4))).toEqual({ all: 4, errors: 2, chaos: 1, scenario: 2 });
    expect(showsIn(LOGS[0] ?? mockLog(), "scenario")).toBe(false);
    expect([
      logMatches(LOGS[1] ?? mockLog(), "ORDERS.create"),
      logMatches(LOGS[1] ?? mockLog(), "users"),
    ]).toEqual([true, false]);
    expect(validateMockLogsSearch({ show: "chaos", q: "users", log: "x", junk: 1 })).toEqual({
      show: "chaos",
      q: "users",
    });
  });
});

describe("the Logs tab", () => {
  it("lists the mock's own requests newest first, tagged by what answered them", async () => {
    await openShell("/mocks/logs");

    expect(
      rows().map(
        (button) => button.textContent?.match(/chaos · 503|scenario|override|handler/)?.[0],
      ),
    ).toEqual(["chaos · 503", "scenario", "override", "handler"]);
    expect(screen.queryByText("/shop")).toBeNull();
  });

  it("narrows to a filter kept in the address, and to a search", async () => {
    const router = await openShell("/mocks/logs");

    await settle(() => fireEvent.click(screen.getByRole("button", { name: /^Errors/ })));
    expect(router.state.location.search).toMatchObject({ show: "errors" });
    expect(rows()).toHaveLength(2);
    await settle(() =>
      fireEvent.change(screen.getByRole("textbox", { name: "Search the log" }), {
        target: { value: "orders.create" },
      }),
    );

    expect(router.state.location.search).toMatchObject({ show: "errors", q: "orders.create" });
    expect(rows()).toHaveLength(1);
  });

  it("opens a request in its sheet: what answered it, what it sent, and a cURL to send it again", async () => {
    const router = await openShell("/mocks/logs");

    await settle(() => fireEvent.click(row("handler")));

    expect(router.state.location.search).toMatchObject({ mreq: "auto" });
    expect(row("handler").getAttribute("aria-pressed")).toBe("true");
    const sheet = within(screen.getByRole("complementary", { name: "Mock request" }));
    expect(sheet.getByText("Answered by").parentElement?.textContent).toContain("handler");
    await settle(() => fireEvent.click(sheet.getByRole("tab", { name: /^Request/ })));
    expect(sheet.getByText(/limit/)).toBeTruthy();
    await settle(() => fireEvent.click(sheet.getByRole("tab", { name: /^cURL/ })));
    expect(sheet.getByText(/curl/)).toBeTruthy();

    await settle(() => fireEvent.keyDown(window, { key: "Escape" }));

    expect(router.state.location.search).not.toHaveProperty("mreq");
  });

  it("clears the mock's log here and in what Studio replays, every other mock's kept", async () => {
    await openShell("/mocks/logs");

    await settle(() => fireEvent.click(screen.getByRole("button", { name: "Clear" })));

    expect(emit).toHaveBeenCalledWith("mock:logs:clear", { serverId: "api-mock" });
    expect(useMockStore.getState().logs.map((log) => log.id)).toEqual(["other"]);
    expect(screen.getByText("No requests yet — call an endpoint the mock serves")).toBeTruthy();
  });

  it("pauses, and says so", async () => {
    await openShell("/mocks/logs");

    await settle(() => fireEvent.click(screen.getByRole("button", { name: "Pause" })));

    expect(useMockStore.getState().logsPaused).toBe(true);
    expect(screen.getByText("Paused — new requests are not added until you resume")).toBeTruthy();
  });

  it("is where the dashboard's All logs leads", async () => {
    await openShell("/mocks");

    expect(screen.getByRole("link", { name: "All logs →" }).getAttribute("href")).toBe(
      "/mocks/logs",
    );
  });
});

describe("a long log", () => {
  it("draws only the rows in view, newest first, and scrolls as far as every request", async () => {
    const many = Array.from({ length: 500 }, (_, i) =>
      mockLog({ id: `log-${i}`, timestamp: 500 - i, path: `/api/users/${i}` }),
    );
    useMockStore.setState({ logs: many });

    await openShell("/mocks/logs");
    const list = screen.getByRole("region", { name: "Requests" });

    expect(rows().length).toBeGreaterThan(0);
    expect(rows().length).toBeLessThan(100);
    expect(within(list).getByText("/api/users/0")).toBeTruthy();
    expect(within(list).queryByText("/api/users/499")).toBeNull();
    expect(list.firstElementChild?.getAttribute("style")).toContain(`height: ${500 * 34}px`);
  });
});
