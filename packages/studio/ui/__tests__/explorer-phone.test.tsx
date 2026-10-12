/**
 * @vitest-environment jsdom
 *
 * The Explorer on a phone: its bar kept to one row — the tabs not open as
 * their icons, still named, and the colour metric picked from a menu — the
 * graph's and the heatmap's legends behind a button, and the Endpoints
 * list putting each endpoint on two lines with the figures named, its
 * count over the list and the kind picked from a menu.
 */
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MEDIA } from "@/design/breakpoints";
import type { EndpointAnalysis, ScannedEndpoint, ScannedSource } from "@/features/apis/types";
import { useStudioStore } from "@/store";
import { requestEntry } from "./request-entry-fixture";
import { openShell } from "./shell-harness";

vi.mock("@/socket", () => ({
  getSocket: () => ({ emit: vi.fn(), on: vi.fn(), off: vi.fn(), connect: vi.fn() }),
}));

const PHONE = new Set<string>([MEDIA.phone, MEDIA.compactShell, MEDIA.coarse]);

function endpoint(name: string, analysis: Partial<EndpointAnalysis> = {}): ScannedEndpoint {
  return {
    name,
    analysis: {
      hasResponseType: true,
      hasVariablesType: true,
      hasValidation: true,
      httpMethod: "get",
      path: "/",
      type: "query",
      ...analysis,
    },
  };
}

const API: ScannedSource = {
  name: "api",
  baseURL: "https://api.example.com",
  filePath: "src/api.ts",
  isImported: false,
  hasClient: true,
  groups: [
    {
      name: "orders",
      prefix: "/orders",
      filePath: "src/api.ts",
      endpoints: [
        endpoint("create", { httpMethod: "post", path: "", type: "mutation" }),
        endpoint("list"),
      ],
    },
  ],
};

const NOW = Date.now();

/* What a phone's browser answers: narrow, held upright, touched. */
function stubPhone(): void {
  vi.stubGlobal("matchMedia", (media: string) => ({
    media,
    matches: PHONE.has(media),
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }));
}

/* The list as wide as a phone's screen, which jsdom does not lay out. */
function narrowLists(): () => void {
  const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => 375,
  });
  return () => {
    if (width) Object.defineProperty(HTMLElement.prototype, "clientWidth", width);
  };
}

async function settle(interaction: () => void): Promise<void> {
  await act(async () => {
    interaction();
  });
}

beforeEach(() => {
  stubPhone();
  useStudioStore.setState({
    connected: true,
    connectionStatus: "connected",
    scanSources: [API],
    requests: [
      requestEntry({
        id: "c1",
        group: "orders",
        method: "create",
        httpMethod: "POST",
        statusCode: 201,
        startedAt: NOW - 2_000,
        timing: { total: 180, middleware: 10, fetch: 165, validation: 5 },
      }),
      requestEntry({
        id: "c2",
        group: "orders",
        method: "create",
        httpMethod: "POST",
        status: "error",
        statusCode: 500,
        startedAt: NOW - 20_000,
        timing: { total: 900, middleware: 10, fetch: 885, validation: 5 },
      }),
    ],
    heldRequests: [],
    paused: false,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the Explorer's bar on a phone", () => {
  it("shows the tabs not open by their icons, each still named", async () => {
    await openShell("/explorer");

    const views = screen.getByRole("navigation", { name: "Explorer views" });
    expect(within(views).getByText("Graph").className).not.toContain("sr-only");
    expect(within(views).getByText("Overview").className).toContain("sr-only");
    expect(within(views).getByRole("link", { name: "Heatmap" })).toBeTruthy();
  });

  it("picks the colour metric from a menu, kept in the address", async () => {
    const router = await openShell("/explorer");
    expect(screen.queryByRole("group", { name: "Color by" })).toBeNull();

    const menu = screen.getByRole("button", { name: /Latency/ });
    await settle(() => fireEvent.pointerDown(menu, { button: 0, pointerType: "mouse" }));
    await settle(() => fireEvent.click(screen.getByRole("menuitemradio", { name: "Errors" })));

    expect(router.state.location.search).toMatchObject({ metric: "errors" });
  });

  it("names every tab in full where none colours by a metric", async () => {
    await openShell("/explorer/overview");

    const views = screen.getByRole("navigation", { name: "Explorer views" });
    expect(within(views).getByText("Heatmap").className).not.toContain("sr-only");
  });
});

describe("the legends on a phone", () => {
  it("puts the graph's legend behind a button", async () => {
    await openShell("/explorer");
    expect(screen.queryByRole("list", { name: "Legend" })).toBeNull();

    await settle(() => fireEvent.click(screen.getByRole("button", { name: "Legend" })));

    expect(
      within(screen.getByRole("list", { name: "Legend" })).getByText("Live call"),
    ).toBeTruthy();
  });

  it("puts the heatmap's scale behind a button", async () => {
    await openShell("/explorer/heatmap");
    expect(screen.queryByText("no calls")).toBeNull();

    await settle(() => fireEvent.click(screen.getByRole("button", { name: "Legend" })));

    expect(screen.getByText("no calls")).toBeTruthy();
  });
});

describe("the Endpoints list on a phone", () => {
  let restore: () => void = () => {};
  beforeEach(() => {
    restore = narrowLists();
  });
  afterEach(() => restore());

  it("puts each endpoint on two lines, its figures named", async () => {
    await openShell("/explorer/endpoints");

    const list = screen.getByRole("region", { name: "Endpoints" });
    const row = within(list)
      .getAllByRole("button")
      .find((button) => button.textContent?.includes("orders.create"));
    expect(row?.textContent).toContain("p95 900ms");
    expect(row?.textContent).toContain("2 calls · 50.0% err");
    expect(row?.textContent).toContain("mutation");
  });

  it("says what it shows over the list, and picks the kind from a menu", async () => {
    await openShell("/explorer/endpoints");

    const list = screen.getByRole("region", { name: "Endpoints" });
    expect(within(list).getByText(/never called$/).textContent).toBe(
      "2 endpoints · 1 never called",
    );
    expect(screen.getByRole("button", { name: /^Kind/ })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Kind" })).toBeNull();
  });
});
