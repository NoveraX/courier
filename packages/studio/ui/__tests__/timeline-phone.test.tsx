/**
 * @vitest-environment jsdom
 *
 * The Timeline on a phone held upright: its filters closed until asked
 * for and then on one row that ends with how many requests show, the bar's
 * other actions in its "⋯" menu, each request on two lines without the
 * columns' heads, a long press opening a row's menu, and a tapped request
 * opening the inspector until Back closes it.
 */
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import type * as Sonner from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useStudioStore } from "@/store";
import { actAsScreen, PHONE } from "./phone-screen";
import { requestEntry } from "./request-entry-fixture";
import { openShell } from "./shell-harness";

vi.mock("@/socket", () => ({
  getSocket: () => ({ emit: vi.fn(), on: vi.fn(), off: vi.fn(), connect: vi.fn() }),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", async (actual) => ({ ...(await actual<typeof Sonner>()), toast }));

const NOW = Date.now();
const REQUESTS = [
  requestEntry({ id: "new", method: "create", httpMethod: "POST", startedAt: NOW - 1_000 }),
  requestEntry({
    id: "failed",
    method: "get",
    status: "error",
    statusCode: 404,
    startedAt: NOW - 2_000,
  }),
  requestEntry({ id: "pinned", method: "list", pinned: true, startedAt: NOW - 3_000 }),
  requestEntry({ id: "old", method: "list", startedAt: NOW - 4_000 }),
];

async function settle(interaction: () => void): Promise<void> {
  await act(async () => {
    interaction();
  });
}

const rowOf = (id: string) => document.querySelector(`[data-request-id="${id}"]`) as HTMLElement;
const rows = () =>
  [...document.querySelectorAll("[data-request-id]")].map((row) =>
    row.getAttribute("data-request-id"),
  );
const toolbar = () => screen.getByLabelText("Filter requests").closest("label")?.parentElement;

let restore = () => {};

beforeEach(() => {
  restore = actAsScreen(PHONE);
  useStudioStore.setState({
    connected: true,
    connectionStatus: "connected",
    received: { runtimes: true, requests: true },
    requests: REQUESTS,
    heldRequests: [],
    paused: false,
    shownSession: null,
  });
});

afterEach(() => {
  cleanup();
  restore();
  vi.unstubAllGlobals();
  toast.success.mockClear();
});

describe("the Timeline on a phone", () => {
  it("starts with its filters closed and its bar holding no count", async () => {
    await openShell("/timeline");

    expect(screen.queryByRole("group", { name: "View" })).toBeNull();
    expect(within(toolbar() as HTMLElement).queryByText("requests", { exact: false })).toBeNull();
  });

  it("opens the filters on one row that ends with how many requests show", async () => {
    await openShell("/timeline");

    await settle(() => fireEvent.click(screen.getByRole("button", { name: /^Filters/ })));

    const filters = screen.getByRole("group", { name: "View" }).parentElement as HTMLElement;
    expect(filters.className).toContain("max-sm:scroll-row");
    expect(filters.lastElementChild?.textContent).toBe("14 requests");
  });

  it("keeps Preserve log, Clear and what the requests become in its ⋯ menu", async () => {
    await openShell("/timeline");
    const more = within(toolbar() as HTMLElement).getByRole("button", { name: "More actions" });

    fireEvent.pointerDown(more, { button: 0, ctrlKey: false, pointerType: "mouse" });

    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Preserve log",
      "Clear",
      "Export as HAR",
      "Share as a session file",
      "Save as test",
    ]);
    act(() => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Clear" }));
    });
    expect(rows()).toEqual([]);
    expect(toast.success).toHaveBeenCalledWith("Cleared");
  });

  it("puts each request on two lines, under no column heads", async () => {
    await openShell("/timeline");

    expect(screen.queryByText("Endpoint")).toBeNull();
    expect(rows()).toEqual(["pinned", "new", "failed", "old"]);
    expect(rowOf("failed").className).toContain("h-13");
    expect(rowOf("failed").textContent).toContain("/api/users?page=2");
  });

  it("measures the list once it is drawn, when the page loaded before Studio sent the requests", async () => {
    useStudioStore.setState({
      connected: false,
      connectionStatus: "connecting",
      received: { runtimes: false, requests: false },
    });
    await openShell("/timeline");
    expect(rows()).toEqual([]);

    await act(async () => {
      useStudioStore.setState({
        connected: true,
        connectionStatus: "connected",
        received: { runtimes: true, requests: true },
      });
    });

    expect(rowOf("failed").className).toContain("h-13");
    expect(screen.queryByText("Endpoint")).toBeNull();
  });

  it("opens a row's menu on a long press, the rows selecting no text under a finger", async () => {
    await openShell("/timeline");

    fireEvent.contextMenu(rowOf("old"));

    expect(rowOf("old").parentElement?.closest(".touch-row")).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Copy as fetch" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Download JSON" })).toBeTruthy();
  });

  it("aims a finger's long press at the row pressed, which no context-menu event names", async () => {
    await openShell("/timeline");

    fireEvent.pointerDown(rowOf("failed"), { pointerType: "touch", button: 0 });
    await act(() => new Promise((done) => setTimeout(done, 750)));

    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toContain(
      "Copy as JSON",
    );
    expect(document.querySelector("[aria-pressed=true]")).toBeNull();
  });

  it("opens a tapped request in the inspector, and closes it on Back", async () => {
    const router = await openShell("/timeline");

    await settle(() => fireEvent.click(rowOf("failed")));
    expect(router.state.location.search).toMatchObject({ req: "failed" });
    expect(screen.getByRole("complementary", { name: "Request inspector" })).toBeTruthy();

    await settle(() => router.history.back());

    expect(router.state.location.search).not.toHaveProperty("req");
    expect(screen.queryByRole("complementary", { name: "Request inspector" })).toBeNull();
  });

  it("closes a tapped request by going back, so Back afterwards does not open it again", async () => {
    const router = await openShell("/timeline");
    await settle(() => fireEvent.click(rowOf("failed")));

    await settle(() =>
      fireEvent.click(screen.getByRole("button", { name: "Close the inspector" })),
    );

    expect(router.state.location.search).not.toHaveProperty("req");
    expect(router.history.canGoBack()).toBe(false);
  });

  it("closes a request a link opened in place, leaving no entry that opens it again", async () => {
    const router = await openShell("/timeline?req=failed");

    await settle(() =>
      fireEvent.click(screen.getByRole("button", { name: "Close the inspector" })),
    );

    expect(router.state.location.search).not.toHaveProperty("req");
    expect(router.history.length).toBe(1);
  });
});
