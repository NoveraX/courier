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

import { validateExplorerSearch } from "@/features/explorer/explorer-search";
import { validateMockStoreSearch } from "@/features/mocks/collection-view";
import { validateMockLogsSearch } from "@/features/mocks/logs-view";
import { validateMockRoutesSearch } from "@/features/mocks/routes-view";
import { validateMockScenariosSearch } from "@/features/mocks/scenario-view";
import { validatePlaygroundSearch } from "@/features/playground/playground-search";
import { validateInspectorSearch } from "@/features/requests/inspector-search";
import { validateTimelineSearch } from "@/features/requests/timeline-search";
import { validateWaterfallSearch } from "@/features/waterfall/waterfall-search";
import { ApisScreen } from "@/screens/apis/apis-screen";
import { EndpointsScreen } from "@/screens/explorer/endpoints-screen";
import { ExplorerLayout } from "@/screens/explorer/explorer-layout";
import { GraphScreen } from "@/screens/explorer/graph-screen";
import { HeatmapScreen } from "@/screens/explorer/heatmap-screen";
import { OverviewScreen } from "@/screens/explorer/overview-screen";
import { MockLogsScreen } from "@/screens/mocks/logs-screen";
import { MocksDashboard } from "@/screens/mocks/mocks-dashboard";
import { MocksLayout } from "@/screens/mocks/mocks-layout";
import { MockNetworkScreen } from "@/screens/mocks/network-screen";
import { MockRoutesScreen } from "@/screens/mocks/routes-screen";
import { MockScenariosScreen } from "@/screens/mocks/scenarios-screen";
import { MockStoreScreen } from "@/screens/mocks/store-screen";
import { PlaygroundScreen } from "@/screens/playground/playground-screen";
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
Object.defineProperty(HTMLElement.prototype, "clientWidth", {
  configurable: true,
  get: () => 1200,
});

/**
 * Render the new shell at an address, with the Timeline, the Waterfall, the
 * Explorer's tabs, the Playground and the Mocks tabs under it and a page of
 * its own at `/next/`, as the app's routes have them.
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
  const explorer = createRoute({
    getParentRoute: () => shell,
    path: "explorer",
    component: ExplorerLayout,
    validateSearch: validateExplorerSearch,
  });
  const tabs = [
    { path: "/", component: GraphScreen },
    { path: "overview", component: OverviewScreen },
    { path: "endpoints", component: EndpointsScreen },
    { path: "heatmap", component: HeatmapScreen },
  ].map(({ path, component }) => createRoute({ getParentRoute: () => explorer, path, component }));
  const playground = createRoute({
    getParentRoute: () => shell,
    path: "playground",
    component: PlaygroundScreen,
    validateSearch: validatePlaygroundSearch,
  });
  const apis = createRoute({ getParentRoute: () => shell, path: "apis", component: ApisScreen });
  const mocks = createRoute({ getParentRoute: () => shell, path: "mocks", component: MocksLayout });
  const mocksDashboard = createRoute({
    getParentRoute: () => mocks,
    path: "/",
    component: MocksDashboard,
  });
  const mocksRoutes = createRoute({
    getParentRoute: () => mocks,
    path: "routes",
    component: MockRoutesScreen,
    validateSearch: validateMockRoutesSearch,
  });
  const mocksStore = createRoute({
    getParentRoute: () => mocks,
    path: "store",
    component: MockStoreScreen,
    validateSearch: validateMockStoreSearch,
  });
  const mocksScenarios = createRoute({
    getParentRoute: () => mocks,
    path: "scenarios",
    component: MockScenariosScreen,
    validateSearch: validateMockScenariosSearch,
  });
  const mocksNetwork = createRoute({
    getParentRoute: () => mocks,
    path: "network",
    component: MockNetworkScreen,
  });
  const mocksLogs = createRoute({
    getParentRoute: () => mocks,
    path: "logs",
    component: MockLogsScreen,
    validateSearch: validateMockLogsSearch,
  });
  const router = createRouter({
    routeTree: root.addChildren([
      shell.addChildren([
        home,
        timeline,
        waterfall,
        explorer.addChildren(tabs),
        playground,
        apis,
        mocks.addChildren([
          mocksDashboard,
          mocksRoutes,
          mocksStore,
          mocksScenarios,
          mocksNetwork,
          mocksLogs,
        ]),
      ]),
    ]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  await act(() => router.load());
  await act(async () => {
    render(<RouterProvider router={router} />);
  });
  return router;
}
