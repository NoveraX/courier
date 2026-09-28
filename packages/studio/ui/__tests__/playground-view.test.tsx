/**
 * @vitest-environment jsdom
 */
/**
 * The Playground as the user drives it: it offers the sources the config
 * declares under the names a runtime hosts them by, from the first render
 * on, and shows where each endpoint is served.
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const emit = vi.hoisted(() => vi.fn());
const search = vi.hoisted(() => ({ current: {} as Record<string, string> }));

vi.mock("socket.io-client", () => ({
  io: () => ({ emit, on: vi.fn(), off: vi.fn(), io: { on: vi.fn(), off: vi.fn() } }),
}));
vi.mock("@tanstack/react-router", () => ({ useSearch: () => search.current }));

import { TooltipProvider } from "@/components/ui/tooltip";
import { useStudioStore } from "@/store";
import { PlaygroundView } from "../src/views/playground";
import { API, BOUND, trafficRequest } from "./playground-fixtures";

function renderPlayground(at: Record<string, string> = {}): void {
  search.current = at;
  render(
    <TooltipProvider>
      <PlaygroundView />
    </TooltipProvider>,
  );
}

function execCalls(): unknown[] {
  return emit.mock.calls.filter(([event]) => event === "playground:exec").map(([, payload]) => payload);
}

/* jsdom lays nothing out, so it has no ResizeObserver; the resizable panels need one to mount. */
class NoLayoutObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", NoLayoutObserver);
  useStudioStore.setState({
    connected: true,
    scanSources: [API],
    bindingSnapshot: BOUND,
    requests: [trafficRequest()],
    playgroundHistory: [],
    playgroundActiveResponse: null,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("the Playground", () => {
  it("offers the declared source, not the name traffic reported, and sends under it", async () => {
    renderPlayground();

    expect(screen.getByRole("button", { name: /^api/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^localhost/ })).toBeNull();

    await act(async () => screen.getByRole("button", { name: "Send" }).click());

    expect(execCalls()).toEqual([
      expect.objectContaining({ source: "api", group: "users", method: "byId", transport: "http" }),
    ]);
  });

  it("offers the declared sources before any request is seen", () => {
    useStudioStore.setState({ requests: [] });
    renderPlayground();

    expect(screen.getByRole("button", { name: /^api/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send" }).hasAttribute("disabled")).toBe(false);
  });

  it("shows where an endpoint is served and whether it writes", () => {
    renderPlayground({ source: "api", group: "users", method: "create" });

    expect(screen.getByText("mutation")).toBeTruthy();
    expect(document.body.textContent).toContain("http://localhost:7501/users");
    cleanup();

    renderPlayground({ source: "api", group: "misc", method: "headers" });

    expect(screen.getByText("query")).toBeTruthy();
    expect(document.body.textContent).toContain("http://localhost:7501/v2/misc/echo/headers");
  });

  it("shows the proxy routes the source declares", async () => {
    renderPlayground({ source: "api", group: "users", method: "byId" });

    await act(async () => screen.getByRole("button", { name: "Proxy" }).click());

    expect(screen.getByText("http://localhost:7502/api/request")).toBeTruthy();
    expect(screen.queryByText("not configured")).toBeNull();
  });
});
