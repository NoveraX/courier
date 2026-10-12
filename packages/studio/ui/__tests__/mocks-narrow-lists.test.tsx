/**
 * @vitest-environment jsdom
 *
 * The Mocks pages in a phone's width: the tabs name only the one open as
 * the current page, Generate mocks keeps its name with its words hidden,
 * the routes and the log — too narrow for their columns — give each row
 * two lines, the log placing its rows at the taller height, the log's bar
 * keeps to one row with its filter and actions in menus, and a request's
 * sheet closes by going back.
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

import { useStudioStore } from "@/store";
import type { MockRouteEntry } from "@/store/mock-slice";
import { useMockStore } from "@/store/mock-slice";
import { mockLog, mockServer } from "./mock-server-fixture";
import { openShell } from "./shell-harness";

const ROUTE: MockRouteEntry = {
  group: "users",
  endpoint: "list",
  httpMethod: "get",
  path: "/users",
  fullPath: "/users",
  source: "override",
  hits: 3,
  avgLatency: 12,
};

/* The width every element reports: a phone's, in place of the desktop's the harness gives. */
function reportWidth(width: number): void {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => width,
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
        routes: [
          ROUTE,
          { ...ROUTE, endpoint: "get", path: "/users/:id", fullPath: "/users/:id", hits: 0 },
        ],
      }),
    },
    activeServerId: "api-mock",
    logs: [
      mockLog({ id: "a", timestamp: 2, source: "override" }),
      mockLog({ id: "b", timestamp: 1, path: "/api/orders" }),
    ],
    logsPaused: false,
  });
});

afterEach(() => {
  cleanup();
  reportWidth(1200);
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/* A phone held upright: every query that asks for one matches, and nothing else does. */
function holdPhone(): void {
  vi.stubGlobal("matchMedia", (media: string) => ({
    media,
    matches: media.includes("max-width: 639px"),
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }));
}

describe("the Mocks tabs", () => {
  it("name only the tab open as the current page", async () => {
    await openShell("/mocks/logs");

    const tabs = within(screen.getByRole("navigation", { name: "Mocks views" }));
    expect(tabs.getAllByRole("link", { current: "page" }).map((link) => link.textContent)).toEqual([
      "Logs",
    ]);
  });

  it("keep Generate mocks named where its words are hidden", async () => {
    await openShell("/mocks");

    expect(screen.getByRole("button", { name: "Generate mocks" })).toBeTruthy();
  });
});

describe("a list too narrow for its columns", () => {
  it("gives each route two lines under no header: its path and handler over its endpoint, average and hits", async () => {
    reportWidth(343);
    await openShell("/mocks/routes");

    const list = within(screen.getByRole("region", { name: "Routes" }));
    expect(list.queryByText("Handler")).toBeNull();
    const rows = list.getAllByRole("button");
    expect(rows.map((row) => row.textContent)).toEqual([
      "GET/usersoverrideusers.list12ms avg · 3 hits",
      "GET/users/:idoverrideusers.getno hits",
    ]);
  });

  it("opens a stacked route for what answers it", async () => {
    reportWidth(343);
    const router = await openShell("/mocks/routes");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /users\.list/ }));
    });

    expect(router.state.location.search).toMatchObject({ open: "GET /users" });
    expect(screen.getByText("An override in courier.mocks.ts answers this route.")).toBeTruthy();
  });

  it("gives each logged request two lines, and places the rows at their height", async () => {
    reportWidth(343);
    await openShell("/mocks/logs");

    const list = screen.getByRole("region", { name: "Requests" });
    expect(list.firstElementChild?.getAttribute("style")).toContain(`height: ${2 * 52}px`);
    const [first] = within(list).getAllByRole("button");
    const lines = first ? [...first.children].map((line) => line.textContent ?? "") : [];
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("GET/api/users200");
    expect(lines[1]).toMatch(/override12ms$/);
  });
});

describe("the log's bar on a phone", () => {
  it("keeps to one row: the search, the filter from a menu that names its count, and Pause, Export and Clear in ⋯", async () => {
    holdPhone();
    await openShell("/mocks/logs");

    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
    expect(screen.getByRole("button", { name: /All · 2/ })).toBeTruthy();
    fireEvent.pointerDown(screen.getByRole("button", { name: "More for this log" }), {
      button: 0,
      ctrlKey: false,
      pointerType: "mouse",
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Clear" }));
    });

    expect(emit).toHaveBeenCalledWith("mock:logs:clear", { serverId: "api-mock" });
  });
});

describe("a mock request's sheet on a phone", () => {
  it("closes by going back over the entry its opening added, so Back does not open it again", async () => {
    holdPhone();
    const router = await openShell("/mocks/logs");
    const before: unknown = router.history.location.state.__TSR_index;
    const [row] = within(screen.getByRole("region", { name: "Requests" })).getAllByRole("button");

    await act(async () => {
      if (row) fireEvent.click(row);
    });
    expect(router.state.location.search).toMatchObject({ mreq: "a" });
    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
    });

    expect(router.state.location.search).not.toHaveProperty("mreq");
    expect(router.history.location.state.__TSR_index).toBe(before);
  });
});
