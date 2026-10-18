/**
 * @vitest-environment jsdom
 *
 * The Waterfall in the new shell: the newest requests on one time scale
 * with their figures, its sort, grouping and mode kept in the address, a
 * click opening the inspector, streams above the requests, holding still
 * while it does not follow, and its zoom.
 */
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useStudioStore } from "@/store";
import { requestEntry } from "./request-entry-fixture";
import { openShell } from "./shell-harness";

vi.mock("@/socket", () => ({
  getSocket: () => ({ emit: vi.fn(), on: vi.fn(), off: vi.fn(), connect: vi.fn() }),
}));

const NOW = Date.now();
const timing = { total: 40, middleware: 10, fetch: 25, validation: 5 };
const REQUESTS = [
  requestEntry({
    id: "create",
    method: "create",
    httpMethod: "POST",
    startedAt: NOW - 1_000,
    timing,
  }),
  requestEntry({
    id: "proxied",
    method: "get",
    mode: "proxy",
    startedAt: NOW - 1_400,
    timing,
    proxyTiming: { clientToProxy: 3, proxyToBackend: 5, backendToProxy: 10, proxyToClient: 2 },
  }),
  requestEntry({
    id: "list",
    method: "list",
    startedAt: NOW - 1_600,
    timing: { ...timing, total: 300, fetch: 285 },
  }),
];

async function settle(interaction: () => void): Promise<void> {
  await act(async () => {
    interaction();
  });
}

const chart = () => screen.getByRole("region", { name: "Waterfall" });
const rowOf = (id: string) => chart().querySelector(`[data-request-id="${id}"]`);

beforeEach(() => {
  useStudioStore.setState({
    connected: true,
    connectionStatus: "connected",
    requests: REQUESTS,
    heldRequests: [],
    paused: false,
  });
});

afterEach(cleanup);

describe("the Waterfall", () => {
  it("counts the calls in view and the requests they sent, where a read shared another's", async () => {
    const [, , list] = REQUESTS;
    if (!list) throw new Error("no request to share");
    useStudioStore.setState({
      requests: [
        ...REQUESTS,
        {
          ...list,
          id: "joined",
          startedAt: list.startedAt + 5,
          shared: { by: "flight", with: "list" },
        },
      ],
    });

    await openShell("/waterfall");

    expect(screen.getByText("of 4 calls · 3 requests in view")).toBeTruthy();
    expect(within(rowOf("joined") as HTMLElement).getByText("shared")).toBeTruthy();
    expect(within(rowOf("list") as HTMLElement).queryByText("shared")).toBeNull();
  });

  it("draws each request with its figures and the count it shows of all", async () => {
    await openShell("/waterfall");

    expect(["create", "proxied", "list"].every((id) => rowOf(id) !== null)).toBe(true);
    expect(screen.getByText("Peak concurrency")).toBeTruthy();
    expect(screen.getByText("api.users.list")).toBeTruthy();
    expect(
      screen
        .getByLabelText("Filter endpoints")
        .closest("label")
        ?.textContent?.replace(/\u00a0/g, " "),
    ).toContain("3 / 3");
    expect(within(chart()).getAllByRole("img", { name: /^Fetch / }).length).toBe(3);
  });

  it("keeps its sort, grouping and mode in the address", async () => {
    const router = await openShell("/waterfall?group=source&mode=proxy");

    expect(within(chart()).getByRole("button", { expanded: true }).textContent).toContain("api");
    expect(rowOf("proxied")).not.toBeNull();
    expect(rowOf("create")).toBeNull();

    await settle(() => fireEvent.click(screen.getByRole("button", { name: "All" })));

    expect(router.state.location.search).toEqual({ group: "source" });
  });

  it("opens a request in the inspector on a click, and closes it on another", async () => {
    const router = await openShell("/waterfall");
    const row = rowOf("list");

    await settle(() => row && fireEvent.click(row));
    expect(router.state.location.search).toMatchObject({ req: "list" });

    await settle(() => row && fireEvent.click(row));
    expect(router.state.location.search).not.toHaveProperty("req");
  });

  it("draws open streams above the requests, under their own header", async () => {
    useStudioStore.setState({
      requests: [
        requestEntry({
          id: "feed",
          transport: "sse",
          streamStatus: "streaming",
          startedAt: NOW - 1_500,
          streamEventCount: 3,
        }),
        ...REQUESTS,
      ],
    });

    await openShell("/waterfall");

    const headers = within(chart()).getAllByRole("button", { expanded: true });
    expect(headers.map((h) => h.textContent)).toEqual([
      expect.stringContaining("Streams"),
      expect.stringContaining("HTTP requests"),
    ]);
    expect(rowOf("feed")?.textContent).toContain("3 msg");
  });

  it("holds the requests in view while it does not follow, and takes the new ones once it does", async () => {
    await openShell("/waterfall");
    await settle(() => fireEvent.click(screen.getByRole("button", { name: /Follow/ })));

    await act(async () =>
      useStudioStore.setState({
        requests: [requestEntry({ id: "late", startedAt: NOW, timing }), ...REQUESTS],
      }),
    );
    expect(rowOf("late")).toBeNull();

    await settle(() => fireEvent.click(screen.getByRole("button", { name: /Follow/ })));
    expect(rowOf("late")).not.toBeNull();
  });

  it("zooms in and out from the toolbar, and back to auto on 0", async () => {
    await openShell("/waterfall");

    await settle(() => fireEvent.click(screen.getByRole("button", { name: "Zoom in" })));
    expect(screen.getByTitle("Reset to auto zoom · 0").textContent).toMatch(/×$/);

    await settle(() => fireEvent.keyDown(window, { key: "0" }));
    expect(screen.getByTitle("Reset to auto zoom · 0").textContent).toBe("Auto");
  });

  it("says why it is empty: nothing captured yet, or nothing passing the search", async () => {
    useStudioStore.setState({ requests: [] });
    await openShell("/waterfall");
    expect(screen.getByText("Waiting for requests")).toBeTruthy();

    cleanup();
    useStudioStore.setState({ requests: REQUESTS });
    await openShell("/waterfall?q=nothing-like-it");
    expect(screen.getByText("No requests in view")).toBeTruthy();
  });
});
