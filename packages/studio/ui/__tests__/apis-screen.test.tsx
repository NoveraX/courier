/**
 * @vitest-environment jsdom
 *
 * The APIs page on the new shell: its counts, each imported API as a card —
 * where its spec came from, what a check found, how typed it is — a check
 * for newer specs, Review update for one that has one, the hand-written
 * sources as a table opening the Explorer, and its states before a config.
 */
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const copied = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api-client", () => ({ post: vi.fn(), get: vi.fn() }));
vi.mock("@/lib/clipboard", () => ({ copyToClipboard: copied }));
vi.mock("@/socket", () => ({
  getSocket: () => ({ emit: vi.fn(), on: vi.fn(), off: vi.fn(), connect: vi.fn() }),
}));

import { apiCardView, handWrittenRow } from "@/features/apis/api-card-view";
import { MINIMAL_CONFIG } from "@/features/apis/minimal-config";
import type { ScannedEndpoint, ScannedSource, SourceSummary } from "@/features/apis/types";
import { post } from "@/lib/api-client";
import { useStudioStore } from "@/store";
import { openShell } from "./shell-harness";

function endpoint(name: string, typed: boolean): ScannedEndpoint {
  return {
    name,
    analysis: {
      hasResponseType: typed,
      hasVariablesType: typed,
      hasValidation: false,
      httpMethod: "get",
      path: `/${name}`,
      type: "query",
    },
  };
}

const BILLING: ScannedSource = {
  name: "billing",
  baseURL: "https://billing.example",
  filePath: "src/api/billing/source.ts",
  isImported: true,
  hasClient: true,
  groups: [
    {
      name: "invoices",
      prefix: "/invoices",
      filePath: "src/api/billing/invoices.ts",
      endpoints: [endpoint("list", true), endpoint("get", false)],
    },
  ],
};
const API: ScannedSource = {
  name: "api",
  baseURL: "https://api.example",
  filePath: "src/api/index.ts",
  isImported: false,
  hasClient: true,
  groups: [
    {
      name: "users",
      prefix: "/users",
      filePath: "src/api/index.ts",
      endpoints: [endpoint("list", true)],
    },
  ],
};
const BILLING_IMPORT: SourceSummary = {
  name: "billing",
  specUrl: "https://billing.example/openapi.json",
  importType: "url",
  outputDir: "src/api/billing",
  options: { validation: "zod" },
};

async function settle(interaction: () => void): Promise<void> {
  await act(async () => {
    interaction();
  });
}

const card = () => screen.getByRole("region", { name: "API billing" });

beforeEach(() => {
  useStudioStore.setState({
    connected: true,
    connectionStatus: "connected",
    configStatus: { state: "loaded", revision: 1, configFile: "courier.config.ts", loadedAt: 1 },
    scanSources: [BILLING, API],
    registrySources: [BILLING_IMPORT],
    requests: [],
    heldRequests: [],
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("an imported API's card", () => {
  it("says where its spec came from, how typed it is, and what a check found", () => {
    const view = apiCardView(
      { ...BILLING, registry: BILLING_IMPORT },
      { status: "updates-available", checkedAt: 1_000 },
      1_000 + 7_200_000,
    );

    expect(view).toMatchObject({
      origin: "https://billing.example/openapi.json",
      update: true,
      checked: "checked 2h ago",
      status: { label: "Update available" },
    });
    expect(view.stats.map((s) => s.value)).toEqual(["2", "1", "zod"]);
    expect(view.quality.map((q) => [q.label, q.count, q.total, q.tone])).toEqual([
      ["Response types", 1, 2, "warn"],
      ["Variables types", 1, 1, "ok"],
      ["Schemas", 0, 2, "subtle"],
    ]);
  });

  it("cannot be checked when its spec has no URL, and says why", () => {
    const view = apiCardView(
      { ...BILLING, registry: { ...BILLING_IMPORT, importType: "raw", specUrl: "" } },
      undefined,
      0,
    );

    expect(view).toMatchObject({
      origin: "pasted spec",
      checked: "not checked yet",
      check: { can: false },
    });
  });
});

describe("the APIs page", () => {
  it("counts the sources and endpoints, and lists the hand-written ones opening the Explorer", async () => {
    await openShell("/apis");

    expect(screen.getByText("1 imported · 1 hand-written · 3 endpoints")).toBeTruthy();
    expect(within(card()).getByText("Not checked")).toBeTruthy();
    const row = within(screen.getByRole("region", { name: "Hand-written sources" })).getByRole(
      "link",
      { name: /api/ },
    );
    expect(row.getAttribute("href")).toBe("/explorer/endpoints?q=api.");
    expect(handWrittenRow(API)).toEqual({
      name: "api",
      endpoints: 1,
      groups: 1,
      typed: 1,
      file: "src/api/index.ts",
    });
  });

  it("checks every import for a newer spec, and offers to review one that has one", async () => {
    vi.mocked(post).mockResolvedValueOnce({ results: { billing: { changed: true } } });
    await openShell("/apis");

    await settle(() => fireEvent.click(screen.getByRole("button", { name: "Check for updates" })));

    expect(post).toHaveBeenCalledWith("/api/apis/imports/check-all");
    expect(within(card()).getByText("Update available")).toBeTruthy();
    expect(within(card()).getByRole("button", { name: "Review update" })).toBeTruthy();
    expect(within(card()).getByText("checked just now")).toBeTruthy();
  });

  it("says so when the project has no config yet, and copies the config it starts from", async () => {
    useStudioStore.setState({
      configStatus: {
        state: "missing",
        revision: 1,
        configFile: null,
        missingAt: 1,
        lastGoodAt: null,
      },
      scanSources: [],
      registrySources: [],
    });

    await openShell("/apis");

    expect(screen.getByText("No courier.config.ts")).toBeTruthy();
    expect(screen.getByText(/^Create courier\.config\.ts at the project root\./)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Import API" })).toHaveProperty("disabled", true);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy config" }));
    });
    expect(copied).toHaveBeenCalledWith(MINIMAL_CONFIG, "config");
  });

  it("says where an API has to be declared while the config declares none", async () => {
    useStudioStore.setState({ scanSources: [], registrySources: [] });

    await openShell("/apis");

    expect(
      screen.getByText(/Studio lists the APIs courier\.config declares under sources\./),
    ).toBeTruthy();
    expect(screen.queryByText(/automatically/)).toBeNull();
  });

  it("says Studio is not connected, not loading for ever, when Studio never answered", async () => {
    useStudioStore.setState({
      connected: false,
      connectionStatus: "disconnected",
      configStatus: null,
      scanSources: [],
      registrySources: [],
    });

    await openShell("/apis");

    const page = screen.getByRole("main");
    expect(within(page).getByRole("heading", { name: "Studio is not connected" })).toBeTruthy();
    expect(within(page).queryByText(/imported ·/)).toBeNull();
    expect(page.querySelector(".animate-pulse, [class*='animate-pulse']")).toBeNull();
    expect(within(page).getByRole("button", { name: "Import API" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("keeps the sources Studio sent once the page loses it", async () => {
    useStudioStore.setState({ connected: false, connectionStatus: "reconnecting" });

    await openShell("/apis");

    expect(card()).toBeTruthy();
    expect(screen.getByText("1 imported · 1 hand-written · 3 endpoints")).toBeTruthy();
  });
});
