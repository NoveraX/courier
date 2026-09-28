/**
 * @vitest-environment jsdom
 */
/**
 * The Playground as the user drives it: it offers the sources the config
 * declares under the names a runtime hosts them by, from the first render
 * on; it shows where each endpoint is served; and it copies and sends a
 * request only as written.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const emit = vi.hoisted(() => vi.fn());
const search = vi.hoisted(() => ({ current: {} as Record<string, string> }));
const toastError = vi.hoisted(() => vi.fn());

vi.mock("socket.io-client", () => ({
  io: () => ({ emit, on: vi.fn(), off: vi.fn(), io: { on: vi.fn(), off: vi.fn() } }),
}));
vi.mock("@tanstack/react-router", () => ({ useSearch: () => search.current }));
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));

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

function variablesEditor(): HTMLTextAreaElement {
  const [variables] = screen.getAllByRole("textbox");
  if (!(variables instanceof HTMLTextAreaElement)) throw new Error("no Variables editor");
  return variables;
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

  it("copies the request as it is sent: its method, path and query", async () => {
    const writeText = vi.fn(async (_text: string) => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });

    renderPlayground({ source: "api", group: "users", method: "remove" });
    fireEvent.change(variablesEditor(), { target: { value: '{ "id": 9 }' } });
    await act(async () => screen.getByRole("button", { name: "Copy as" }).click());
    await act(async () => screen.getByRole("button", { name: "cURL" }).click());
    cleanup();

    renderPlayground({ source: "api", group: "users", method: "search" });
    fireEvent.change(variablesEditor(), { target: { value: '{ "q": "ada", "limit": 5 }' } });
    await act(async () => screen.getByRole("button", { name: "Copy as" }).click());
    await act(async () => screen.getByRole("button", { name: "URL" }).click());

    expect(writeText.mock.calls).toEqual([
      ["curl \\\n  -X DELETE \\\n  'http://localhost:7501/users/9'"],
      ["http://localhost:7501/users/search?q=ada&limit=5"],
    ]);
  });

  it("claims no header dropped by a direct call, which sends every header", async () => {
    renderPlayground({ source: "api", group: "users", method: "create" });

    await act(async () => screen.getByRole("button", { name: /Headers/ }).click());
    const [, headersEditor] = screen.getAllByRole("textbox");
    fireEvent.change(headersEditor, { target: { value: '{ "x-client-tag": "pg", "x-not-allowed": "1" }' } });
    await act(async () => screen.getByRole("button", { name: "Send" }).click());
    const tabs = screen.getAllByRole("button", { name: /^Headers$/ });
    await act(async () => tabs[tabs.length - 1].click());

    expect(execCalls()).toEqual([
      expect.objectContaining({ headers: { "x-client-tag": "pg", "x-not-allowed": "1" } }),
    ]);
    expect(screen.queryByText(/Dropped Headers/)).toBeNull();
    expect(screen.getByText("Request Headers (2)")).toBeTruthy();
  });

  it("lists the headers a proxy reported it did not forward", async () => {
    useStudioStore.setState({
      playgroundActiveResponse: {
        id: "e1", rid: "e1", source: "api", group: "users", method: "create",
        variables: "{}", headers: '{ "x-client-tag": "pg", "x-not-allowed": "1" }',
        mode: "proxy", timestamp: 1, status: "success", statusCode: 201,
        requestHeaders: { "x-client-tag": "pg" },
      },
    });
    renderPlayground({ source: "api", group: "users", method: "create" });

    const tabs = screen.getAllByRole("button", { name: /^Headers$/ });
    await act(async () => tabs[tabs.length - 1].click());

    expect(screen.getByText("Dropped Headers (1)")).toBeTruthy();
    expect(screen.getByText("x-not-allowed")).toBeTruthy();
  });

  it("says why it sends nothing when the variables are not JSON", async () => {
    renderPlayground({ source: "api", group: "users", method: "byId" });

    fireEvent.change(variablesEditor(), { target: { value: '{ "id": ' } });
    await act(async () => screen.getByRole("button", { name: "Send" }).click());

    expect(execCalls()).toEqual([]);
    expect(toastError).toHaveBeenCalledWith("Variables are not valid JSON");
  });
});
