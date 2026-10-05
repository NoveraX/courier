import type { AnyRouter } from "@tanstack/react-router";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, render } from "@testing-library/react";
import { MotionGlobalConfig } from "motion/react";

import { validateInspectorSearch } from "@/features/requests/inspector-search";
import { validateTimelineSearch } from "@/features/requests/timeline-search";
import { validateWaterfallSearch } from "@/features/waterfall/waterfall-search";
import { TimelineScreen } from "@/screens/timeline/timeline-screen";
import { WaterfallScreen } from "@/screens/waterfall/waterfall-screen";
import { StudioShell } from "@/shell/studio-shell";

/* jsdom has neither; the palette and the lists measure themselves and scroll their selection into view. */
globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};
Element.prototype.scrollIntoView ??= () => {};

/* A test reads what the shell shows once it has settled, not mid-animation; one that is about
   the motion itself turns it back on. */
MotionGlobalConfig.skipAnimations = true;

/* jsdom lays nothing out: the Timeline's list is given a window's height to draw its rows in. */
Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
  configurable: true,
  get: () => 800,
});
Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
  configurable: true,
  get: () => 1200,
});

/**
 * Render the new shell at an address, with the Timeline and the Waterfall
 * under it and a page of its own at `/next/`, as the app's routes have them.
 *
 * @param url - The address
 * @returns The router, to read where it went
 */
export async function openShell(url: string): Promise<AnyRouter> {
  const root = createRootRoute({ component: Outlet });
  const shell = createRoute({
    getParentRoute: () => root,
    path: "next",
    component: StudioShell,
    validateSearch: validateInspectorSearch,
  });
  const home = createRoute({
    getParentRoute: () => shell,
    path: "/",
    component: () => <p>Home</p>,
  });
  const timeline = createRoute({
    getParentRoute: () => shell,
    path: "timeline",
    component: TimelineScreen,
    validateSearch: validateTimelineSearch,
  });
  const waterfall = createRoute({
    getParentRoute: () => shell,
    path: "waterfall",
    component: WaterfallScreen,
    validateSearch: validateWaterfallSearch,
  });
  const router = createRouter({
    routeTree: root.addChildren([shell.addChildren([home, timeline, waterfall])]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  await act(() => router.load());
  await act(async () => {
    render(<RouterProvider router={router} />);
  });
  return router;
}
