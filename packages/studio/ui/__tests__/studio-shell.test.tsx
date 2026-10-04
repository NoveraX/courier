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
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StudioShell } from "@/shell/studio-shell";
import { useStudioStore } from "@/store";

/* jsdom has neither; the palette's list measures itself and scrolls its selection into view. */
globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};
Element.prototype.scrollIntoView ??= () => {};

async function open(url = "/next"): Promise<void> {
  const root = createRootRoute({ component: Outlet });
  const shell = createRoute({ getParentRoute: () => root, path: "next", component: StudioShell });
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
    getParentRoute: () => root,
    path: "timeline",
    component: () => <p>Timeline</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([shell.addChildren([home, view]), timeline]),
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
    studioInfo: { version: "1.2.3", startedAt: 1_700, project: { name: "acme-shop" } },
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
    bindingSnapshot: { rows: [], runtimeCount: 0, sourceCount: 0, runtimes: [] },
    requests: [],
    paused: false,
    shownSession: null,
    theme: "dark",
  });
});

afterEach(cleanup);

describe("the shell", () => {
  it("names the project and Studio's version as Studio gives them, and the app attached", async () => {
    attach();

    await open();

    expect(screen.getByText("acme-shop")).toBeTruthy();
    expect(screen.getByText("1.2.3")).toBeTruthy();
    expect(screen.getByText("vite-browser · localhost:5173")).toBeTruthy();
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

    await open("/next/view");

    expect(screen.getByRole("alert").textContent).toContain("Studio cannot be reached.");
    expect(screen.getByText("attempt 3")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Studio cannot be reached" }).textContent).toContain(
      "OFFLINE",
    );
  });

  it("records only while an app is attached, and says OFFLINE on a view until one is", async () => {
    await open("/next/view");
    const idle = screen.getByRole("button", { name: "Pause recording · no app is attached yet" });
    expect(idle.textContent).toBe("OFFLINE");

    act(() => attach());

    expect(screen.getByRole("button", { name: "Pause recording" }).textContent).toBe("REC");
  });

  it("leaves the recording button off the setup page until an app attaches", async () => {
    await open();
    expect(screen.queryByText("OFFLINE")).toBeNull();
    expect(screen.queryByText("REC")).toBeNull();

    act(() => attach());

    expect(screen.getByRole("button", { name: "Pause recording" }).textContent).toBe("REC");
  });

  it("draws its overlays on the shell's type, though they render outside the shell", async () => {
    await open();

    fireEvent.click(screen.getByRole("button", { name: /no app attached/ }));
    const apps = await screen.findByText("Attached apps");
    expect(apps.closest("[data-shell]")).not.toBeNull();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    fireEvent.keyDown(window, { key: "k", metaKey: true });

    const palette = await screen.findByRole("dialog", { name: "Search Studio" });
    expect(palette.hasAttribute("data-shell")).toBe(true);
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
    expect(options).toContain("Pause recording⌘ .");
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

  it("pauses recording with ⌘. and changes the theme with ⇧⌘L", async () => {
    await open();

    fireEvent.keyDown(window, { key: ".", metaKey: true });
    fireEvent.keyDown(window, { key: "L", metaKey: true, shiftKey: true });

    expect(useStudioStore.getState().paused).toBe(true);
    expect(useStudioStore.getState().theme).toBe("light");
    expect(screen.getByText("PAUSED")).toBeTruthy();
  });
});
