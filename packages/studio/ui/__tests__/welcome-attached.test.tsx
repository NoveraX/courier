/**
 * @vitest-environment jsdom
 *
 * Studio opened on a project whose app is attached already goes to the
 * Timeline: the setup it would offer is done. It stays on the setup when the
 * setup was asked for, from Settings.
 */
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { WELCOME_STORAGE_KEY } from "@/features/welcome/frameworks";
import { validateWelcomeSearch } from "@/features/welcome/welcome-search";
import { useStudioStore } from "@/store";
import { WelcomeView } from "@/views/welcome";

async function open(url: string) {
  const root = createRootRoute({
    component: () => (
      <TooltipProvider>
        <Outlet />
      </TooltipProvider>
    ),
  });
  const welcome = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: WelcomeView,
    validateSearch: validateWelcomeSearch,
  });
  const timeline = createRoute({
    getParentRoute: () => root,
    path: "/timeline",
    component: () => <p>Timeline</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([welcome, timeline]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  await act(() => router.load());
  await act(async () => {
    render(<RouterProvider router={router} />);
  });
  return router;
}

function attached(count: number): void {
  useStudioStore.setState({
    connected: true,
    connectionStatus: "connected",
    bindingSnapshot: {
      rows: [],
      runtimeCount: count,
      sourceCount: count,
      runtimes: count > 0 ? [{ runtimeId: "demo-server", kind: "server" }] : [],
    },
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(cleanup);

describe("Studio opened on a project", () => {
  it("goes to the Timeline when its app is attached", async () => {
    attached(1);

    const router = await open("/");

    expect(router.state.location.pathname).toBe("/timeline");
    expect(localStorage.getItem(WELCOME_STORAGE_KEY)).toBe("true");
  });

  it("stays on the setup asked for from Settings", async () => {
    attached(1);

    const router = await open("/?setup=true");

    expect(router.state.location.pathname).toBe("/");
    expect(screen.getByText("Set up Courier Studio")).toBeTruthy();
  });

  it("offers the setup while no app is attached", async () => {
    attached(0);

    const router = await open("/");

    expect(router.state.location.pathname).toBe("/");
    expect(screen.getByText("Choose your framework to get started")).toBeTruthy();
  });
});
