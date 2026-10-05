/**
 * @vitest-environment jsdom
 *
 * The Audit page on the new shell: what the report read and its score, the
 * first finding open with its fix and the fixing line drawn out, the
 * severity, category and search filters kept in the address, an endpoint's
 * calls one link away, a report that holds still until Re-run and says what
 * came since, one opened before any request arrived, and the page with no
 * traffic at all.
 */
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runAudit } from "@/features/audit/run-audit";
import { useStudioStore } from "@/store";
import { buildCatalog } from "@/store/build-catalog";
import type { RequestEntry } from "@/store/types";
import { requestEntry } from "./request-entry-fixture";
import { openShell } from "./shell-harness";

vi.mock("@/socket", () => ({
  getSocket: () => ({ emit: vi.fn(), on: vi.fn(), off: vi.fn(), connect: vi.fn() }),
}));

const NOW = Date.now();

function call(id: string, fields: Partial<RequestEntry>): RequestEntry {
  return requestEntry({ id, group: "orders", startedAt: NOW - 60_000, ...fields });
}

/* Calls that fail often, one that runs into a timeout, and a write with no credentials. */
const TRAFFIC: RequestEntry[] = [
  ...[1, 2, 3].map((i) => call(`ok${i}`, { method: "list" })),
  ...[1, 2, 3].map((i) => call(`bad${i}`, { method: "flaky", status: "error", statusCode: 502 })),
  call("slow", {
    method: "report",
    timing: { total: 6_000, middleware: 0, fetch: 6_000, validation: 0 },
  }),
  call("write", {
    method: "create",
    httpMethod: "POST",
    type: "mutation",
    variables: { sku: "a" },
  }),
];

async function settle(interaction: () => void): Promise<void> {
  await act(async () => {
    interaction();
  });
}

const findings = () =>
  within(screen.getByRole("region", { name: "Findings" })).getAllByRole("article");

beforeEach(() => {
  useStudioStore.setState({
    connected: true,
    connectionStatus: "connected",
    requests: TRAFFIC,
    heldRequests: [],
    shownSession: null,
    scanSources: [],
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("the Audit page", () => {
  it("says what the report read, shows its score, and opens the first finding with its fix", async () => {
    const expected = runAudit(TRAFFIC, buildCatalog([], TRAFFIC), { browserSessions: new Set() });

    await openShell("/next/audit");

    expect(screen.getByText(/^8 requests · 4 endpoints · analysed just now/)).toBeTruthy();
    const score = screen.getByRole("region", { name: "Score" });
    expect(within(score).getByText(String(expected.score))).toBeTruthy();
    const [first] = expected.items;
    const open = screen.getByRole("button", { expanded: true });
    expect(open.textContent).toContain(first?.title);
    expect(screen.getByText("Suggested fix")).toBeTruthy();
    expect(document.querySelector("pre .bg-ok-dim")?.textContent).toMatch(
      /\.retry\(|\.timeout\(|authMiddleware/,
    );
    expect(findings().length).toBe(expected.items.length);
  });

  it("keeps the severity, the category and the search in the address", async () => {
    const router = await openShell("/next/audit");

    await settle(() =>
      fireEvent.click(
        within(screen.getByRole("group", { name: "Severity" })).getByRole("button", {
          name: /^Errors/,
        }),
      ),
    );
    expect(router.state.location.search).toMatchObject({ sev: "error" });
    expect(screen.queryByText("No findings match the current filters")).toBeNull();

    await settle(() => fireEvent.click(screen.getByRole("button", { name: /^Security/ })));
    expect(router.state.location.search).toMatchObject({ sev: "error", cat: "security" });
    await settle(() =>
      fireEvent.click(screen.getByRole("button", { name: "Security only — show every category" })),
    );
    expect(router.state.location.search).not.toHaveProperty("cat");

    await settle(() =>
      fireEvent.change(screen.getByRole("textbox", { name: "Search findings" }), {
        target: { value: "nothing like this" },
      }),
    );
    expect(screen.getByText("No findings match the current filters")).toBeTruthy();
  });

  it("links an endpoint's calls to the Timeline searched for it", async () => {
    await openShell("/next/audit?sev=error");

    const highErrorRate = screen.getByRole("button", { name: /High error rate/ });
    if (highErrorRate.getAttribute("aria-expanded") === "false")
      await settle(() => fireEvent.click(highErrorRate));

    const link = screen.getAllByRole("link", { name: /View calls/ })[0];
    expect(link?.getAttribute("href")).toBe("/next/timeline?q=api.orders.flaky");
  });

  it("holds still while requests arrive, says how many came, and takes them in on Re-run", async () => {
    await openShell("/next/audit");

    await settle(() =>
      useStudioStore.setState((s) => ({
        requests: [call("late", { method: "list", startedAt: Date.now() + 1_000 }), ...s.requests],
      })),
    );
    expect(screen.getByText(/^8 requests/)).toBeTruthy();
    expect(screen.getByText("· 1 new since")).toBeTruthy();

    await settle(() => fireEvent.click(screen.getByRole("button", { name: "Re-run" })));
    expect(screen.getByText(/^9 requests/)).toBeTruthy();
  });

  it("reads the requests that arrive after it opened with none", async () => {
    useStudioStore.setState({ requests: [] });
    await openShell("/next/audit");
    expect(screen.getByText("No requests to audit")).toBeTruthy();

    await settle(() => useStudioStore.setState({ requests: TRAFFIC }));

    expect(screen.getByText(/^8 requests/)).toBeTruthy();
    expect(screen.queryByText(/new since/)).toBeNull();
    expect(screen.getByRole("button", { expanded: true }).textContent).toContain("High error rate");
  });
});
