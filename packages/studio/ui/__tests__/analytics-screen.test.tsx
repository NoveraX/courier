/**
 * @vitest-environment jsdom
 *
 * Analytics on the new shell: the project and its counts, the headline
 * figures, the charts' data in words, a range kept in the address that
 * narrows every figure, the endpoints sorted by a column's head, an
 * endpoint opening its newest calls with the Timeline searched for the
 * rest, one called once opening that call, and what it says with nothing
 * in range.
 */
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useStudioStore } from "@/store";
import type { RequestEntry } from "@/store/types";
import { requestEntry } from "./request-entry-fixture";
import { openShell } from "./shell-harness";

vi.mock("@/socket", () => ({
  getSocket: () => ({ emit: vi.fn(), on: vi.fn(), off: vi.fn(), connect: vi.fn() }),
}));

const NOW = Date.now();

let seq = 0;
function call(agoMs: number, total: number, fields: Partial<RequestEntry> = {}): RequestEntry {
  seq += 1;
  return requestEntry({
    id: `c${seq}`,
    startedAt: NOW - agoMs,
    timing: { total, middleware: 0, fetch: total, validation: 0 },
    ...fields,
  });
}

const INVOICES = { source: "billing", group: "invoices", method: "list" } as const;

/* Ten calls of billing.invoices.list over the last half minute, one failing; an old call of api.users.list; one of api.health. */
const REQUESTS: RequestEntry[] = [
  ...Array.from({ length: 10 }, (_, i) =>
    call(3_000 * (i + 1), 100 * (i + 1), {
      ...INVOICES,
      ...(i === 0 ? { status: "error", statusCode: 503 } : {}),
    }),
  ),
  call(240_000, 80),
  call(1_000, 40, { source: "api", group: undefined, method: "health" }),
];

async function settle(interaction: () => void): Promise<void> {
  await act(async () => {
    interaction();
  });
}

const endpoints = () => within(screen.getByRole("region", { name: "Endpoints" }));
const figures = () => screen.getByRole("region", { name: "Headline figures" });

beforeEach(() => {
  useStudioStore.setState({
    connected: true,
    connectionStatus: "connected",
    requests: REQUESTS,
    heldRequests: [],
    shownSession: null,
    studioInfo: { version: "2.4.0", startedAt: 1, project: { name: "acme-web", dependencies: [] } },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Analytics", () => {
  it("names the project and counts the session's completed requests and endpoints", async () => {
    await openShell("/analytics");

    expect(screen.getByRole("heading", { name: "Analytics" })).toBeTruthy();
    expect(screen.getByText("acme-web · 12 completed requests · 3 endpoints")).toBeTruthy();
    expect(
      within(figures()).getByText("Total requests").parentElement?.parentElement?.textContent,
    ).toContain("12");
    expect(within(figures()).getByText("11 succeeded")).toBeTruthy();
    expect(
      screen.getByText(/How 12 completed requests ended\. Success: 11 \(91\.7%\)/),
    ).toBeTruthy();
  });

  it("narrows every figure to the range chosen, and keeps it in the address", async () => {
    const router = await openShell("/analytics");

    await settle(() => fireEvent.click(screen.getByRole("button", { name: "1 min" })));

    expect(router.state.location.search).toMatchObject({ range: "1m" });
    expect(screen.getByText("acme-web · 11 completed requests · 2 endpoints")).toBeTruthy();
    expect(within(figures()).getByText("last minute")).toBeTruthy();
  });

  it("sorts by the slowest p95 first, and turns a column around on a click of its head", async () => {
    const router = await openShell("/analytics");
    const order = () =>
      endpoints()
        .getAllByRole("button")
        .map((button) => button.textContent ?? "")
        .filter((text) => text.startsWith("GET"));

    expect(order()[0]).toContain("invoices.list");
    await settle(() => fireEvent.click(endpoints().getByRole("button", { name: /^P95/ })));

    expect(router.state.location.search).toMatchObject({ dir: "asc" });
    expect(endpoints().getByRole("button", { name: /P95.*sorted ascending/ })).toBeTruthy();
    expect(order().at(-1)).toContain("invoices.list");
  });

  it("opens an endpoint's newest calls, and links the Timeline searched for it to see the rest", async () => {
    await openShell("/analytics");

    await settle(() =>
      fireEvent.click(endpoints().getByRole("button", { name: /invoices\.list/ })),
    );

    const row = endpoints().getByRole("button", { name: /invoices\.list/ });
    expect(row.getAttribute("aria-expanded")).toBe("true");
    const calls = document.getElementById("calls-billing.invoices.list");
    expect(calls?.querySelectorAll("button")).toHaveLength(8);
    expect(calls?.textContent).toContain("503");
    const more = within(calls as HTMLElement).getByRole("link", {
      name: "open Timeline to see all",
    });
    expect(more.getAttribute("href")).toBe("/timeline?q=billing.invoices.list");
    expect(calls?.textContent).toContain("+ 2 older calls");
  });

  it("opens the call of an endpoint called once in the inspector", async () => {
    const router = await openShell("/analytics");

    await settle(() => fireEvent.click(endpoints().getByRole("button", { name: /api\.health/ })));

    expect(router.state.location.search).toMatchObject({ req: REQUESTS.at(-1)?.id });
  });

  it("says nothing completed in the range, and keeps the range to choose another", async () => {
    useStudioStore.setState({ requests: [call(240_000, 80)] });

    await openShell("/analytics?range=1m");

    expect(screen.getByText("No request completed in the last minute")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Endpoints" })).toBeNull();
    expect(screen.getByRole("button", { name: "Session" })).toBeTruthy();
  });

  it("reads a saved session against its end, so its last minute is not empty", async () => {
    useStudioStore.setState({
      shownSession: { id: "s1", name: "checkout" },
      requests: [call(3_601_000, 120), call(3_630_000, 90), call(3_720_000, 60)],
    });

    await openShell("/analytics?range=1m");

    expect(screen.getByText("acme-web · 2 completed requests · 1 endpoint")).toBeTruthy();
    expect(
      within(screen.getByRole("region", { name: "Requests over time" })).getByText("end"),
    ).toBeTruthy();
  });
});
