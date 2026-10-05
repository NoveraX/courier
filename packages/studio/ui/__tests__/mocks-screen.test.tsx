/**
 * @vitest-environment jsdom
 *
 * The Mocks pages in the new shell: the way to a first mock, the server in
 * use with its controls and a menu of the others, the banner that says a
 * server stopped, and the dashboard's figures, answers, routes and data.
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
    timeout: () => ({ emit }),
  }),
}));

import { useStudioStore } from "@/store";
import { useMockStore } from "@/store/mock-slice";
import { mockLog, mockServer } from "./mock-server-fixture";
import { openShell } from "./shell-harness";

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
    mocksFileStatus: null,
  });
  useMockStore.setState({ servers: {}, activeServerId: null, logs: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("the Mocks pages", () => {
  it("offer to generate a first mock while there is none", async () => {
    useStudioStore.setState({
      connectionStatus: "connected",
      configStatus: {
        state: "loaded",
        revision: 1,
        configFile: "courier.config.ts",
        loadedAt: Date.now(),
      },
    });
    await openShell("/mocks");

    expect(screen.getByText("No mock servers yet")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Generate mocks/ }).length).toBeGreaterThan(0);
  });

  it("show the server in use and stop it", async () => {
    useMockStore.setState({ servers: { "api-mock": mockServer() }, activeServerId: "api-mock" });
    await openShell("/mocks");

    expect(screen.getByText("Running")).toBeTruthy();
    await settle(() =>
      fireEvent.click(screen.getByRole("button", { name: "Stop the mock server" })),
    );

    expect(emit).toHaveBeenCalledWith("mock:managed", {
      command: "mock:managed:stop",
      serverId: "api-mock",
    });
  });

  it("say a stopped server is stopped, and start it from the banner", async () => {
    useMockStore.setState({
      servers: { "api-mock": mockServer({ processStatus: "stopped" }) },
      activeServerId: "api-mock",
    });
    await openShell("/mocks");

    const banner = screen.getByRole("status", { name: "" });
    expect(within(banner).getByText("Mock server stopped")).toBeTruthy();
    await settle(() =>
      fireEvent.click(within(banner).getByRole("button", { name: "Start server" })),
    );
    expect(emit).toHaveBeenCalledWith("mock:managed", {
      command: "mock:managed:start",
      serverId: "api-mock",
    });
  });

  it("give the dashboard's figures, newest answers, busiest routes and collections", async () => {
    const server = mockServer({
      routes: [
        {
          group: "users",
          endpoint: "list",
          httpMethod: "get",
          path: "/api/users",
          fullPath: "/api/users",
          source: "auto",
          hits: 9,
          avgLatency: 12,
        },
      ],
      collections: [{ name: "users", count: 5, records: [] }],
      requestsServed: 9,
    });
    useMockStore.setState({
      servers: { "api-mock": server },
      activeServerId: "api-mock",
      logs: [mockLog({ timestamp: Date.now() })],
    });
    await openShell("/mocks");

    const figures = screen.getByRole("region", { name: "Mock figures" });
    expect(within(figures).getByText("Routes").parentElement?.textContent).toBe(
      "Routes10 overridden or custom",
    );
    expect(
      within(screen.getByRole("region", { name: "Live activity" })).getByText("/api/users"),
    ).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Top routes" })).getByText("9")).toBeTruthy();
    expect(
      within(screen.getByRole("region", { name: "Collections" })).getByText("5 records"),
    ).toBeTruthy();
  });

  it("open a newest answer in its sheet from the dashboard", async () => {
    useMockStore.setState({
      servers: { "api-mock": mockServer() },
      activeServerId: "api-mock",
      logs: [mockLog({ id: "newest", timestamp: Date.now(), data: [{ id: 7 }] })],
    });
    const router = await openShell("/mocks");

    const activity = within(screen.getByRole("region", { name: "Live activity" }));
    await act(async () => {
      fireEvent.click(activity.getByText("/api/users"));
    });

    expect(router.state.location.search).toMatchObject({ mreq: "newest" });
    expect(screen.getByRole("complementary", { name: "Mock request" })).toBeTruthy();
  });

  it("switch between servers from the pill's menu", async () => {
    useMockStore.setState({
      servers: {
        "api-mock": mockServer(),
        "pay-mock": mockServer({ serverId: "pay-mock", name: "pay-mock", port: 7002 }),
      },
      activeServerId: "api-mock",
    });
    await openShell("/mocks");

    await settle(() =>
      fireEvent.keyDown(screen.getByRole("button", { name: "Mock server: api-mock" }), {
        key: "Enter",
      }),
    );
    await settle(() => fireEvent.click(screen.getByRole("menuitemradio", { name: /pay-mock/ })));

    expect(useMockStore.getState().activeServerId).toBe("pay-mock");
  });
});
