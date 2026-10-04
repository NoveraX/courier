/**
 * @vitest-environment jsdom
 *
 * The rebuilt setup: the framework the project's packages tell is picked
 * until another is; picking a framework shows its steps; each copy
 * completes its step, here and in the sidebar's progress; an attached app
 * completes the connect step and opens the way to the Timeline — and a
 * project set up already goes straight on, unless the setup was asked for.
 */
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSetupStore } from "@/features/welcome/setup-store";
import { validateWelcomeSearch } from "@/features/welcome/welcome-search";
import { WelcomeScreen } from "@/screens/welcome/welcome-screen";
import { useStudioStore } from "@/store";

async function open(url: string) {
  const root = createRootRoute({ component: Outlet });
  const next = createRoute({ getParentRoute: () => root, path: "next", component: Outlet });
  const welcome = createRoute({
    getParentRoute: () => next,
    path: "/",
    component: WelcomeScreen,
    validateSearch: validateWelcomeSearch,
  });
  const timeline = createRoute({
    getParentRoute: () => root,
    path: "timeline",
    component: () => <p>Timeline view</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([next.addChildren([welcome]), timeline]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  await act(() => router.load());
  await act(async () => {
    render(<RouterProvider router={router} />);
  });
  return router;
}

function attach(): void {
  useStudioStore.setState({
    bindingSnapshot: {
      rows: [],
      runtimeCount: 1,
      sourceCount: 2,
      runtimes: [{ runtimeId: "vite-browser", kind: "browser" }],
    },
  });
}

beforeEach(() => {
  localStorage.clear();
  useSetupStore.setState({ frameworkId: null, copied: new Set() });
  useStudioStore.setState({
    studioInfo: null,
    connected: true,
    connectionStatus: "connected",
    requests: [],
    paused: false,
    bindingSnapshot: { rows: [], runtimeCount: 0, sourceCount: 0, runtimes: [] },
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn(async () => {}) },
  });
});

afterEach(cleanup);

describe("the setup", () => {
  it("shows a framework's steps once it is picked", async () => {
    await open("/next");
    expect(screen.getByText("Pick your framework above, and its steps appear here.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^React/ }));

    expect(screen.getByText("Add the Vite plugin")).toBeTruthy();
    expect(screen.getByText("0 of 4 complete")).toBeTruthy();
  });

  it("picks the framework the project's packages tell, and names them, until another is picked", async () => {
    useStudioStore.setState({
      studioInfo: {
        version: "1.2.3",
        startedAt: 1_700,
        project: { name: "acme-web", dependencies: ["react", "react-dom", "vite"] },
      },
    });

    await open("/next");

    expect(screen.getByText("detected: vite · react")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^React/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByText("Add the Vite plugin")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Vue/ }));

    expect(screen.getByRole("button", { name: /^Vue/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /^React/ }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("completes a step when its command is copied", async () => {
    await open("/next?framework=react");

    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Copy" })[0] as HTMLElement);
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "npm install -D @noverax/courier-studio",
    );
    expect(screen.getByText("1 of 4 complete")).toBeTruthy();
    expect(screen.getByText("Copied")).toBeTruthy();
  });

  it("completes the connect step when an app attaches, and opens the way to the Timeline", async () => {
    await open("/next?setup=true&framework=react");
    const goTo = screen.getByRole("button", { name: /Go to Timeline/ });
    expect(goTo.hasAttribute("disabled")).toBe(true);

    act(() => attach());

    expect(screen.getByText("vite-browser attached")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Go to Timeline/ }).hasAttribute("disabled")).toBe(
      false,
    );
  });

  it("goes on to the Timeline for a project whose app is attached, unless the setup was asked for", async () => {
    attach();

    const router = await open("/next");
    expect(router.state.location.pathname).toBe("/timeline");

    cleanup();
    const asked = await open("/next?setup=true");
    expect(asked.state.location.pathname).toBe("/next");
  });
});
