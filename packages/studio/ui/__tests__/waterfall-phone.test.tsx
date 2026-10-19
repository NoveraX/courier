/**
 * @vitest-environment jsdom
 *
 * The Waterfall on a phone held upright: no column of labels, each row
 * naming its request on a line over its bar as wide as the chart shows,
 * tall enough for a finger; and a search with room to type in, the count
 * of what shows moved to the end of the row of sort, grouping and mode.
 */
import { act, cleanup, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useStudioStore } from "@/store";
import { actAsScreen, PHONE } from "./phone-screen";
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
  requestEntry({ id: "list", method: "list", startedAt: NOW - 1_600, timing }),
];

const chart = () => screen.getByRole("region", { name: "Waterfall" });
const rowOf = (id: string) =>
  chart().querySelector(`[data-request-id="${id}"]`) as HTMLElement | null;

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
});

describe("the Waterfall on a phone", () => {
  it("names each request over its bar, as wide as the chart shows, with no column of labels", async () => {
    await openShell("/waterfall");
    const row = rowOf("list");
    const label = row?.firstElementChild as HTMLElement | null;

    expect(within(chart()).queryByText("Request")).toBeNull();
    expect(row?.className).toContain("flex-col");
    expect(row?.className).toContain("h-11");
    expect(label?.style.width).toBe(`${PHONE.width}px`);
    expect(label?.textContent).toContain("api.users.list");
  });

  it("measures the chart once it is drawn, when the page loaded before Studio sent the requests", async () => {
    useStudioStore.setState({
      connected: false,
      connectionStatus: "connecting",
      received: { runtimes: false, requests: false },
    });
    await openShell("/waterfall");
    expect(screen.queryByRole("region", { name: "Waterfall" })).toBeNull();

    await act(async () => {
      useStudioStore.setState({
        connected: true,
        connectionStatus: "connected",
        received: { runtimes: true, requests: true },
      });
    });

    const label = rowOf("list")?.firstElementChild as HTMLElement | null;
    expect(rowOf("list")?.className).toContain("flex-col");
    expect(label?.style.width).toBe(`${PHONE.width}px`);
  });

  it("leaves the search room to type in, counting what shows at the end of the sort row", async () => {
    await openShell("/waterfall");
    const search = screen.getByLabelText("Filter endpoints").closest("label");
    const sorts = screen.getByRole("button", { name: /^Sort/ }).parentElement;

    expect(search?.textContent).not.toContain("/ 2");
    expect(sorts?.lastElementChild?.textContent?.replace(/ /g, " ")).toBe("2 / 2");
  });
});
