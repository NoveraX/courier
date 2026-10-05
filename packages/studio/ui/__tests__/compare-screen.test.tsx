/**
 * @vitest-environment jsdom
 *
 * Compare on the new shell: a success against a failure by default, the
 * ready-made pair it is, what moved at a glance, the responses diffed and
 * narrowed to the changes, the headers with what changed — kept in the
 * address apart from the inspector's tab — a swap, a call picked for a
 * side, a link naming a call no longer held, and too little traffic.
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

function call(id: string, ago: number, fields: Partial<RequestEntry>): RequestEntry {
  return requestEntry({ id, startedAt: NOW - ago, method: "get", ...fields });
}

const OK = call("ok", 30_000, {
  data: { id: 1, a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, status: "paid" },
  headers: { "content-type": "application/json", etag: "a" },
  timing: { total: 120, middleware: 4, fetch: 110, validation: 6 },
});
const FAILED = call("failed", 10_000, {
  status: "error",
  statusCode: 503,
  data: { id: 1, a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, status: "unavailable" },
  headers: { "content-type": "application/json", "retry-after": "3" },
  timing: { total: 900, middleware: 4, fetch: 890, validation: 6 },
});
const OTHER = call("other", 1_000, { method: "list", data: [1, 2] });

async function settle(interaction: () => void): Promise<void> {
  await act(async () => {
    interaction();
  });
}

beforeEach(() => {
  useStudioStore.setState({
    connected: true,
    connectionStatus: "connected",
    requests: [OTHER, FAILED, OK],
    heldRequests: [],
    shownSession: null,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Compare", () => {
  it("shows a success against a failure of one endpoint by default, and what moved", async () => {
    await openShell("/compare");

    expect(screen.getByRole("button", { name: "Request A: api.users.get" }).textContent).toContain(
      "200",
    );
    expect(screen.getByRole("button", { name: "Request B: api.users.get" }).textContent).toContain(
      "503",
    );
    expect(
      screen.getByRole("button", { name: "Success vs failure" }).getAttribute("aria-pressed"),
    ).toBe("true");
    const glance = within(screen.getByRole("region", { name: "At a glance" }));
    expect(glance.getByText("regressed")).toBeTruthy();
    expect(glance.getByText("+650%")).toBeTruthy();
  });

  it("diffs the responses, and narrows them to the changes", async () => {
    await openShell("/compare");

    const lines = () => document.querySelectorAll("pre")[0]?.children.length ?? 0;
    const all = lines();
    expect(document.body.textContent).toContain('"unavailable"');

    await settle(() => fireEvent.click(screen.getByRole("button", { name: "Only changes" })));

    expect(lines()).toBeLessThan(all);
    expect(document.querySelectorAll("pre")[0]?.textContent).toContain('"paid"');
    expect(
      screen.getByRole("button", { name: "Show all lines" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("shows the headers that changed, keeping the choice in the address apart from the inspector's tab", async () => {
    const router = await openShell("/compare");

    await settle(() => fireEvent.click(screen.getByRole("button", { name: /^Headers/ })));

    expect(router.state.location.search).toMatchObject({ show: "headers" });
    expect(router.state.location.search).not.toHaveProperty("tab");
    const table = within(screen.getByRole("region", { name: "Headers" }));
    expect(table.getByText("retry-after").parentElement?.textContent).toContain("added");
    expect(table.getByText("etag").parentElement?.textContent).toContain("removed");
  });

  it("swaps the sides, and puts a picked call on one", async () => {
    const router = await openShell("/compare");

    await settle(() => fireEvent.click(screen.getByRole("button", { name: "Swap A and B" })));
    expect(router.state.location.search).toMatchObject({ a: "failed", b: "ok" });

    await settle(() => fireEvent.click(screen.getByRole("button", { name: /^Request B/ })));
    const listed = screen
      .getAllByRole("button")
      .filter((b) => b.textContent?.includes("users.list"));
    await settle(() => fireEvent.click(listed.at(-1) as HTMLElement));

    expect(router.state.location.search).toMatchObject({ a: "failed", b: "other" });
  });

  it("says when a call the link named is no longer held", async () => {
    await openShell("/compare?a=gone&b=ok");

    expect(screen.getByRole("status").textContent).toContain("no longer held");
  });

  it("asks for two finished requests while there are fewer", async () => {
    useStudioStore.setState({ requests: [OK] });

    await openShell("/compare");

    expect(screen.getByText("Compare needs two finished requests")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Ready-made pairs" })).toBeNull();
  });
});
