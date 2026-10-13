/**
 * @vitest-environment jsdom
 *
 * The navigation drawer in the sidebar's place on a narrow window or a
 * phone held sideways: the menu button opens it with everything the
 * sidebar holds, the theme and the whole status; it closes on a link
 * followed, Esc, its close button and once the window is wide enough for
 * the sidebar again, and gives the focus back to the menu button.
 */
import type { AnyRouter } from "@tanstack/react-router";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MEDIA } from "@/design/breakpoints";
import { StudioShell } from "@/shell/studio-shell";
import { useStudioStore } from "@/store";

globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};
Element.prototype.scrollIntoView ??= () => {};

/* A window whose width a test changes: narrow enough for the drawer, or wide enough for the sidebar. */
function fakeScreen(compact: boolean): { set: (next: boolean) => void } {
  let matches = compact;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (media: string) => ({
    media,
    get matches() {
      return media === MEDIA.compactShell && matches;
    },
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }));
  return {
    set(next) {
      matches = next;
      for (const listener of listeners) listener();
    },
  };
}

async function openShell(url: string): Promise<AnyRouter> {
  const shell = createRootRoute({ component: StudioShell });
  const routes = ["timeline", "analytics", "settings"].map((path) =>
    createRoute({ getParentRoute: () => shell, path, component: () => <p>{path}</p> }),
  );
  const home = createRoute({ getParentRoute: () => shell, path: "/", component: () => null });
  const router = createRouter({
    routeTree: shell.addChildren([home, ...routes]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  await act(() => router.load());
  await act(async () => {
    render(<RouterProvider router={router} />);
  });
  return router;
}

/* Hidden from assistive technology while the drawer is open, as everything outside a modal is. */
const menuButton = (): HTMLElement =>
  screen.getByRole("button", { name: "Open navigation", hidden: true });
const drawer = (): HTMLElement => screen.getByRole("dialog", { name: "Navigation" });
const noDrawer = (): HTMLElement | null => screen.queryByRole("dialog", { name: "Navigation" });

beforeEach(() => {
  useStudioStore.setState({
    connected: true,
    connectionStatus: "connected",
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

describe("the navigation drawer", () => {
  it("opens from the menu button with the views, the setup, Settings, the docs, the theme and the status", async () => {
    fakeScreen(true);
    await openShell("/timeline");
    expect(noDrawer()).toBeNull();

    fireEvent.click(menuButton());

    const links = within(drawer())
      .getAllByRole("link")
      .map((link) => link.textContent?.replace(/\d+$/, ""));
    expect(links).toEqual([
      "Get started",
      "Timeline",
      "Waterfall",
      "Analytics",
      "Explorer",
      "Playground",
      "APIs",
      "Mocks",
      "Audit",
      "Middleware",
      "Compare",
      "Docs",
      "Settings",
    ]);
    /* The documentation itself, not the site's landing page. */
    expect(within(drawer()).getByRole("link", { name: /^Docs/ }).getAttribute("href")).toBe(
      "https://courier.noverax.cloud/docs",
    );
    expect(
      within(drawer()).getByRole("button", { name: "Theme: Dark. Switch to Light" }),
    ).toBeTruthy();
    expect(within(drawer()).getByRole("region", { name: "Status" }).textContent).toContain(
      "waiting for an app",
    );
    expect(menuButton().getAttribute("aria-expanded")).toBe("true");
  });

  it("closes on a link followed, and shows where it led", async () => {
    fakeScreen(true);
    const router = await openShell("/timeline");
    fireEvent.click(menuButton());

    await act(async () => {
      fireEvent.click(within(drawer()).getByRole("link", { name: "Analytics" }));
    });

    expect(noDrawer()).toBeNull();
    expect(router.state.location.pathname).toBe("/analytics");
  });

  it("closes on Esc and on its close button, and gives the focus back to the menu button", async () => {
    fakeScreen(true);
    await openShell("/timeline");
    fireEvent.click(menuButton());
    await waitFor(() => expect(drawer().contains(document.activeElement)).toBe(true));

    fireEvent.keyDown(drawer(), { key: "Escape" });

    expect(noDrawer()).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(menuButton()));

    fireEvent.click(menuButton());
    fireEvent.click(within(drawer()).getByRole("button", { name: "Close navigation" }));

    expect(noDrawer()).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(menuButton()));
  });

  it("closes once the window is wide enough for the sidebar", async () => {
    const screenSize = fakeScreen(true);
    await openShell("/timeline");
    fireEvent.click(menuButton());
    expect(drawer()).toBeTruthy();

    act(() => screenSize.set(false));

    expect(noDrawer()).toBeNull();
    expect(menuButton().getAttribute("aria-expanded")).toBe("false");
  });

  it("changes the theme from its theme row, and stays open to show it", async () => {
    fakeScreen(true);
    await openShell("/timeline");
    fireEvent.click(menuButton());

    fireEvent.click(within(drawer()).getByRole("button", { name: /^Theme: Dark/ }));

    expect(useStudioStore.getState().theme).toBe("light");
    expect(
      within(drawer()).getByRole("button", { name: "Theme: Light. Switch to Auto" }),
    ).toBeTruthy();
  });
});
