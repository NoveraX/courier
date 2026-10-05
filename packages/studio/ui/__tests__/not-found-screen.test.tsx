/**
 * @vitest-environment jsdom
 *
 * An address Studio has no page for — an old link, a mistyped path — says
 * so and leads back to the Timeline, instead of an empty shell.
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
import { afterEach, describe, expect, it } from "vitest";

import { NotFoundScreen } from "@/screens/not-found-screen";

afterEach(cleanup);

describe("an address with no page", () => {
  it("says so, and leads back to the Timeline", async () => {
    const root = createRootRoute({ component: Outlet, notFoundComponent: NotFoundScreen });
    const timeline = createRoute({
      getParentRoute: () => root,
      path: "timeline",
      component: () => <p>Timeline</p>,
    });
    const router = createRouter({
      routeTree: root.addChildren([timeline]),
      history: createMemoryHistory({ initialEntries: ["/next/timeline"] }),
    });
    await act(() => router.load());
    await act(async () => {
      render(<RouterProvider router={router} />);
    });

    expect(screen.getByRole("heading", { name: "No page here" })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("link", { name: "Back to the Timeline" }));
    });

    expect(router.state.location.pathname).toBe("/timeline");
    expect(screen.getByText("Timeline")).toBeTruthy();
  });
});
