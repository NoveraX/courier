/**
 * @vitest-environment jsdom
 *
 * The Middleware page on the new shell: what the session's middleware
 * costs, a card a middleware opening the chain of a call it failed in, the
 * endpoints it weighs on opening their newest chain, the chain inspector
 * tracing a picked call — kept in the address apart from the inspector's
 * own — with a way into the inspector and no fetch for a call a middleware
 * stopped, and the page before any middleware ran.
 */
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useStudioStore } from "@/store";
import type { MiddlewareEntry, RequestEntry } from "@/store/types";
import { requestEntry } from "./request-entry-fixture";
import { openShell } from "./shell-harness";

vi.mock("@/socket", () => ({
  getSocket: () => ({ emit: vi.fn(), on: vi.fn(), off: vi.fn(), connect: vi.fn() }),
}));

function run(name: string, index: number, fields: Partial<MiddlewareEntry> = {}): MiddlewareEntry {
  return {
    requestId: "r",
    name,
    index,
    startedAt: 0,
    duration: 2,
    status: "completed",
    phase: "wrap",
    ...fields,
  };
}

function call(id: string, method: string, entries: MiddlewareEntry[]): RequestEntry {
  return requestEntry({
    id,
    method,
    startedAt: Date.now() - 1_000,
    middlewareEntries: entries,
    middlewareCount: entries.length,
    timing: { total: 100, middleware: 8, fetch: 88, validation: 4 },
  });
}

const CALLS: RequestEntry[] = [
  call("newest", "list", [run("auth", 0, { headersAdded: ["authorization"] }), run("log", 1)]),
  call("failed", "get", [
    run("auth", 0, { status: "error", error: "Token refresh failed" }),
    run("log", 1),
  ]),
  call("older", "list", [run("auth", 0), run("log", 1)]),
];

async function settle(interaction: () => void): Promise<void> {
  await act(async () => {
    interaction();
  });
}

beforeEach(() => {
  useStudioStore.setState({
    connected: true,
    connectionStatus: "connected",
    requests: CALLS,
    heldRequests: [],
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("the Middleware page", () => {
  it("says what the session's middleware costs, each middleware with its runs and failures", async () => {
    await openShell("/middleware");

    expect(screen.getByText("2 middleware · 3 requests traced")).toBeTruthy();
    const overhead = within(screen.getByRole("region", { name: "Overhead" }));
    expect(overhead.getByText("8.0%")).toBeTruthy();
    expect(overhead.getByText("Middleware is lightweight")).toBeTruthy();
    const auth = screen.getByRole("button", { name: /^auth/ });
    expect(auth.textContent).toContain("+ authorization");
    expect(auth.textContent).toContain("1 failed");
  });

  it("opens the chain of a call a middleware failed in from its card", async () => {
    const router = await openShell("/middleware");

    await settle(() => fireEvent.click(screen.getByRole("button", { name: /^auth/ })));

    expect(router.state.location.search).toMatchObject({ view: "chain", trace: "failed" });
    expect(screen.getByText("Token refresh failed")).toBeTruthy();
  });

  it("goes back to the overview from a chain it opened, with the browser's Back", async () => {
    const router = await openShell("/middleware");
    await settle(() => fireEvent.click(screen.getByRole("button", { name: /^auth/ })));
    expect(router.state.location.search).toMatchObject({ view: "chain" });

    await settle(() => router.history.back());

    expect(router.state.location.pathname).toBe("/middleware");
    expect(router.state.location.search).not.toHaveProperty("view");
    expect(screen.getByRole("region", { name: "Impact by endpoint" })).toBeTruthy();
  });

  it("opens an endpoint's newest chain from the impact table", async () => {
    const router = await openShell("/middleware");

    const impact = within(screen.getByRole("region", { name: "Impact by endpoint" }));
    await settle(() => fireEvent.click(impact.getByRole("button", { name: /users\.list/ })));

    expect(router.state.location.search).toMatchObject({ view: "chain", trace: "newest" });
  });

  it("traces a picked call in the chain inspector, and opens it in the inspector", async () => {
    const router = await openShell("/middleware?view=chain");

    const list = within(screen.getByRole("region", { name: "Requests" }));
    await settle(() => fireEvent.click(list.getAllByRole("button")[2] as HTMLElement));
    expect(router.state.location.search).toMatchObject({ trace: "older" });
    const chain = within(screen.getByRole("region", { name: "Chain" }));
    expect(
      chain.getAllByRole("listitem").map((li) => li.textContent?.split(/wrap|network/)[0]),
    ).toEqual(["auth", "log", "fetch"]);

    await settle(() => fireEvent.click(chain.getByRole("button", { name: "Inspect" })));
    expect(router.state.location.search).toMatchObject({ req: "older", trace: "older" });
  });

  it("draws no fetch in the chain of a call a middleware stopped, and says it failed", async () => {
    const stopped = requestEntry({
      id: "stopped",
      status: "error",
      statusCode: undefined,
      url: undefined,
      startedAt: Date.now(),
      middlewareEntries: [run("auth", 0, { status: "error", error: "No token" })],
      middlewareCount: 1,
      timing: { total: 3, middleware: 3, fetch: 0, validation: 0 },
    });
    useStudioStore.setState({ requests: [stopped, ...CALLS] });

    await openShell("/middleware?view=chain&trace=stopped");

    const chain = within(screen.getByRole("region", { name: "Chain" }));
    const steps = within(chain.getByRole("list", { name: "Pipeline" }));
    expect(steps.getAllByRole("listitem").map((li) => li.textContent?.split(/wrap/)[0])).toEqual([
      "auth",
    ]);
    expect(chain.getByText(/^Error/)).toBeTruthy();
  });

  it("says no call ran through middleware yet", async () => {
    useStudioStore.setState({ requests: [requestEntry({ id: "plain" })] });

    await openShell("/middleware");

    expect(screen.getByText("No call has run through middleware yet")).toBeTruthy();
  });
});
