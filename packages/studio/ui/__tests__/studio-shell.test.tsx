/**
 * @vitest-environment jsdom
 *
 * The new shell around every rebuilt view: the project by the name Studio
 * gives and its attached apps, Studio's version, the views with their
 * counts, the status bar's connection and traffic, and the command palette
 * — ⌘K opens it, ⌘. pauses recording, ⇧⌘L changes the theme.
 */
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioShell } from "@/shell/studio-shell";
import { useStudioStore } from "@/store";
import { createInitialState } from "@/store/initial-state";

/* jsdom has neither; the palette's list measures itself and scrolls its selection into view. */
globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};
Element.prototype.scrollIntoView ??= () => {};

async function open(url = "/"): Promise<void> {
  const shell = createRootRoute({ component: StudioShell });
  const home = createRoute({
    getParentRoute: () => shell,
    path: "/",
    component: () => <p>Home</p>,
  });
  const view = createRoute({
    getParentRoute: () => shell,
    path: "view",
    component: () => <p>A view</p>,
  });
  const timeline = createRoute({
    getParentRoute: () => shell,
    path: "timeline",
    component: () => <p>Timeline</p>,
  });
  const router = createRouter({
    routeTree: shell.addChildren([home, view, timeline]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  await act(() => router.load());
  await act(async () => {
    render(<RouterProvider router={router} />);
  });
}

function attach(): void {
  useStudioStore.setState({
    connected: true,
    connectionStatus: "connected",
    received: { runtimes: true, requests: true },
    studioInfo: {
      version: "1.2.3",
      startedAt: 1_700,
      project: { name: "acme-shop", dependencies: [] },
    },
    bindingSnapshot: {
      rows: [
        {
          sourceName: "api",
          transport: "http",
          status: "bound",
          runtimeId: "vite-browser",
          appOrigin: "http://localhost:5173",
        },
      ],
      runtimeCount: 1,
      sourceCount: 1,
      runtimes: [{ runtimeId: "vite-browser", kind: "browser" }],
    },
  });
}

beforeEach(() => {
  useStudioStore.setState({
    studioInfo: null,
    connected: true,
    connectionStatus: "connected",
    received: { runtimes: true, requests: true },
    bindingSnapshot: { rows: [], runtimeCount: 0, sourceCount: 0, runtimes: [] },
    requests: [],
    paused: false,
    shownSession: null,
    theme: "dark",
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/* The keycaps an option shows, each key's label in order. */
function keysOf(option: HTMLElement): string[] {
  return [...option.querySelectorAll('kbd kbd[aria-hidden="true"]')].map(
    (key) => key.textContent ?? "",
  );
}

describe("the shell", () => {
  it("names the project and Studio's version as Studio gives them, and the app attached", async () => {
    attach();

    await open();

    expect(screen.getByText("acme-shop")).toBeTruthy();
    expect(screen.getByText("1.2.3")).toBeTruthy();
    expect(screen.getByText("vite-browser · localhost:5173")).toBeTruthy();
  });

  it("says the page connects while it first does, not that Studio cannot be reached", async () => {
    useStudioStore.setState({ connected: false, connectionStatus: "connecting" });

    await open();

    expect(screen.getByText("connecting…", { selector: "aside *" })).toBeTruthy();
    expect(screen.queryByText("Studio unreachable")).toBeNull();
  });

  it("stops vouching for the apps it last listed once Studio cannot be reached", async () => {
    attach();
    await open();
    expect(screen.getByText("vite-browser · localhost:5173")).toBeTruthy();

    act(() => useStudioStore.setState({ connected: false, connectionStatus: "reconnecting" }));

    expect(screen.getByText("Studio unreachable")).toBeTruthy();
    expect(screen.queryByText("vite-browser · localhost:5173")).toBeNull();
  });

  it("says the page is still connecting until Studio has said which apps are attached", async () => {
    useStudioStore.setState({ received: { runtimes: false, requests: false } });
    await open();
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByText("connecting…")).toBeTruthy();

    act(() => useStudioStore.getState().setReceived("runtimes"));

    expect(within(footer).getByText("waiting for an app")).toBeTruthy();
  });

  it("says Studio waits for an app until one attaches, then counts runtimes and sources", async () => {
    await open();
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByText("waiting for an app")).toBeTruthy();

    act(() => attach());

    expect(within(footer).getByText("1 runtime · 1 source")).toBeTruthy();
  });

  it("says Studio cannot be reached, in a banner and on the recording button", async () => {
    useStudioStore.setState({
      connected: false,
      connectionStatus: "reconnecting",
      reconnectAttempt: 3,
    });

    await open("/view");

    expect(screen.getByRole("alert").textContent).toContain("Studio cannot be reached.");
    expect(screen.getByText("attempt 3")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Studio cannot be reached" }).textContent).toContain(
      "OFFLINE",
    );
  });

  it("opens connecting, and says Studio cannot be reached once a connection that opened drops", async () => {
    expect(createInitialState("dark").connectionStatus).toBe("connecting");
    useStudioStore.setState({ connected: false, connectionStatus: "disconnected" });

    await open("/view");

    expect(screen.getByRole("alert").textContent).toContain("Studio cannot be reached.");
    expect(screen.queryByText(/^attempt/)).toBeNull();
  });

  it("records only while an app is attached, and says OFFLINE on a view until one is", async () => {
    await open("/view");
    const idle = screen.getByRole("button", { name: "Pause recording · no app is attached yet" });
    expect(idle.textContent).toBe("OFFLINE");

    act(() => attach());

    expect(screen.getByRole("button", { name: "Pause recording" }).textContent).toBe("REC");
  });

  it("holds the recording button's place until Studio has said what the page shows", async () => {
    attach();
    useStudioStore.setState({ received: { runtimes: true, requests: false } });
    await open("/view");
    expect(screen.queryByRole("button", { name: "Pause recording" })).toBeNull();
    expect(screen.queryByText("OFFLINE")).toBeNull();

    act(() => useStudioStore.getState().setReceived("requests"));

    expect(screen.getByRole("button", { name: "Pause recording" }).textContent).toBe("REC");
  });

  it("says nothing of recording while the page first connects", async () => {
    useStudioStore.setState({ connected: false, connectionStatus: "connecting" });

    await open("/view");

    expect(screen.queryByText("OFFLINE")).toBeNull();
    expect(screen.queryByText("REC")).toBeNull();
  });

  it("leaves the recording button off the setup page until an app attaches", async () => {
    await open();
    expect(screen.queryByText("OFFLINE")).toBeNull();
    expect(screen.queryByText("REC")).toBeNull();

    act(() => attach());

    expect(screen.getByRole("button", { name: "Pause recording" }).textContent).toBe("REC");
  });

  it("opens the palette with ⌘K, with every view and the actions", async () => {
    await open();

    fireEvent.keyDown(window, { key: "k", metaKey: true });

    const dialog = await screen.findByRole("dialog");
    const options = within(dialog)
      .getAllByRole("option")
      .map((option) => option.textContent ?? "");
    expect(options).toContain("TimelineInspect");
    expect(options).toContain("Get startedSetup");
    expect(options).toContain("Show streamsSSE · WebSocket");
    /* The test's page is no Mac's: its keys read Ctrl, as Windows and Linux label them. */
    expect(keysOf(within(dialog).getByRole("option", { name: /^Pause recording/ }))).toEqual([
      "Ctrl",
      ".",
    ]);
    expect(keysOf(within(dialog).getByRole("option", { name: /^Export the requests/ }))).toEqual([
      "Ctrl",
      "E",
    ]);
    expect(
      keysOf(within(dialog).getByRole("option", { name: /^Clear captured requests/ })),
    ).toEqual(["Ctrl", "Backspace"]);
    expect(within(dialog).queryByText("Recent requests")).toBeNull();
    expect(within(dialog).getByText(/results$/).textContent).toMatch(/^\d+ results$/);
  });

  it("lists the latest calls first in the palette once there are any", async () => {
    useStudioStore.setState({
      requests: [
        {
          id: "r1",
          source: "api",
          group: "users",
          method: "list",
          httpMethod: "GET",
          statusCode: 200,
          variables: undefined,
          mode: "direct",
          status: "success",
          middlewareCount: 0,
          middlewareEntries: [],
          hasValidation: { variables: false, response: false },
          startedAt: 0,
          sessionId: "s",
        },
      ],
    });
    await open();

    fireEvent.keyDown(window, { key: "k", metaKey: true });

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Recent requests")).toBeTruthy();
    expect(within(dialog).getAllByRole("option")[0]?.textContent).toBe("users.listGET · 200");
  });

  it("reaches Settings and the docs from the palette, the docs in a new tab", async () => {
    const windowOpen = vi.fn();
    vi.stubGlobal("open", windowOpen);
    await open("/view");

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const dialog = await screen.findByRole("dialog");
    const options = within(dialog).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(
      expect.arrayContaining(["SettingsSystem", "DocsCourier's documentation"]),
    );
    fireEvent.click(within(dialog).getByRole("option", { name: /^Docs/ }));

    expect(windowOpen).toHaveBeenCalledWith(
      "https://courier.noverax.cloud/docs",
      "_blank",
      "noopener,noreferrer",
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("names the palette's button for what it does, as a phone shows it as a magnifier alone", async () => {
    await open("/view");

    fireEvent.click(screen.getByRole("button", { name: "Search or jump to…" }));

    expect(await screen.findByRole("dialog", { name: "Search Studio" })).toBeTruthy();
  });

  it("pauses recording with ⌘. and changes the theme with ⇧⌘L", async () => {
    await open();

    fireEvent.keyDown(window, { key: ".", metaKey: true });
    fireEvent.keyDown(window, { key: "L", metaKey: true, shiftKey: true });

    expect(useStudioStore.getState().paused).toBe(true);
    expect(useStudioStore.getState().theme).toBe("light");
    expect(screen.getByText("PAUSED")).toBeTruthy();
  });
});
