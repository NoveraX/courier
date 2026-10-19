/**
 * @vitest-environment jsdom
 *
 * The new Timeline: the requests newest first, the pinned ones above, the
 * quick views and the search kept in the address, a row opening its
 * request in the inspector and the keys moving through them, the requests
 * held while recording pauses shown on resume, and what it says with
 * nothing to show.
 */
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import type * as Sonner from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useStudioStore } from "@/store";
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

/* A click or a key that navigates: the router settles before the page is read. */
async function settle(interaction: () => void): Promise<void> {
  await act(async () => {
    interaction();
  });
}

const rows = () =>
  [...document.querySelectorAll("[data-request-id]")].map((row) =>
    row.getAttribute("data-request-id"),
  );

beforeEach(() => {
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

afterEach(cleanup);

describe("the Timeline", () => {
  it("lists the pinned requests above the live ones, newest first, and counts them", async () => {
    await openShell("/timeline");

    expect(rows()).toEqual(["pinned", "new", "failed", "old"]);
    expect(screen.getByText("Pinned")).toBeTruthy();
    expect(screen.getByText("Live")).toBeTruthy();
    expect(screen.getByText("requests", { exact: false }).textContent).toBe("4 requests");
  });

  it("marks a read another call's request answered in its row, and no other", async () => {
    useStudioStore.setState({
      requests: [
        requestEntry({
          id: "joined",
          method: "list",
          startedAt: NOW - 500,
          shared: { by: "flight", with: "old" },
        }),
        ...REQUESTS,
      ],
    });

    await openShell("/timeline");

    const row = (id: string) => document.querySelector(`[data-request-id="${id}"]`) as HTMLElement;
    expect(within(row("joined")).getByText("shared").getAttribute("title")).toMatch(
      /^Joined the identical read already in flight/,
    );
    expect(within(row("old")).queryByText("shared")).toBeNull();
  });

  it("shows a quick view and keeps it in the address", async () => {
    const router = await openShell("/timeline");

    await settle(() => fireEvent.click(screen.getByRole("button", { name: /^Errors/ })));

    expect(rows()).toEqual(["failed"]);
    expect(router.state.location.search).toMatchObject({ view: "errors" });
    expect(screen.getByText("of 4 requests", { exact: false }).textContent).toBe("1 of 4 requests");
  });

  it("opens a row's request in the inspector, and closes it on a second click", async () => {
    const router = await openShell("/timeline");
    const row = () => document.querySelector('[data-request-id="failed"]') as HTMLElement;

    await settle(() => fireEvent.click(row()));

    expect(router.state.location.search).toMatchObject({ req: "failed" });
    expect(screen.getByRole("complementary", { name: "Request inspector" })).toBeTruthy();

    await settle(() => fireEvent.click(row()));

    expect(router.state.location.search).not.toHaveProperty("req");
    expect(screen.queryByRole("complementary", { name: "Request inspector" })).toBeNull();
  });

  it("moves through the rows with j and k, from the top when none is open", async () => {
    const router = await openShell("/timeline");

    await settle(() => fireEvent.keyDown(window, { key: "j" }));
    expect(router.state.location.search).toMatchObject({ req: "pinned" });

    await settle(() => fireEvent.keyDown(window, { key: "ArrowDown" }));
    await settle(() => fireEvent.keyDown(window, { key: "j" }));
    expect(router.state.location.search).toMatchObject({ req: "failed" });

    await settle(() => fireEvent.keyDown(window, { key: "k" }));
    expect(router.state.location.search).toMatchObject({ req: "new" });
  });

  it("finds requests by the search, and resets the filters when none match", async () => {
    await openShell("/timeline?q=nothing-like-this");
    expect(screen.getByText("No requests match")).toBeTruthy();

    await settle(() => fireEvent.click(screen.getByRole("button", { name: "Reset filters" })));

    expect(rows()).toHaveLength(4);
  });

  it("offers the requests held while recording pauses, and shows them on resume", async () => {
    useStudioStore.setState({
      paused: true,
      heldRequests: [requestEntry({ id: "held", startedAt: NOW })],
    });
    await openShell("/timeline");

    fireEvent.click(screen.getByRole("button", { name: "1 new · resume" }));

    expect(useStudioStore.getState().paused).toBe(false);
    expect(rows()).toContain("held");
  });

  it("waits for requests while there are none", async () => {
    useStudioStore.setState({ requests: [] });

    await openShell("/timeline");

    expect(screen.getByText("Waiting for requests")).toBeTruthy();
  });

  it("narrows by a filter's value chosen in its menu", async () => {
    await openShell("/timeline");

    fireEvent.click(screen.getByRole("button", { name: /^Method/ }));
    const menu = await screen.findByRole("dialog");
    await settle(() => fireEvent.click(within(menu).getByRole("checkbox", { name: "POST" })));

    expect(rows()).toEqual(["new"]);
  });

  it("keeps pinned requests on Clear while Preserve log is on", async () => {
    await openShell("/timeline");

    fireEvent.click(screen.getByRole("button", { name: /Preserve log/ }));
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /^Clear$/ }));
    });

    expect(rows()).toEqual(["pinned"]);
    expect(toast.success).toHaveBeenCalledWith("Cleared · pinned kept");
  });
});

describe("the Timeline's last minute", () => {
  it("is the last minute of a saved session while one shows, not the minute before now", async () => {
    const ended = NOW - 3_600_000;
    useStudioStore.setState({
      shownSession: { id: "s1", name: "checkout" },
      requests: [
        requestEntry({ id: "a", startedAt: ended - 1_000 }),
        requestEntry({ id: "b", startedAt: ended - 20_000 }),
        requestEntry({ id: "c", startedAt: ended - 90_000 }),
      ],
    });

    await openShell("/timeline");

    const perMinute = screen.getByText("Req / min").nextElementSibling;
    expect(perMinute?.textContent).toBe("2");
    expect(screen.getByText("end")).toBeTruthy();
  });
});
