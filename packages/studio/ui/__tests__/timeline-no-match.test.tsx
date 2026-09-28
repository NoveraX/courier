/**
 * @vitest-environment jsdom
 */
/**
 * A Timeline search that matches nothing says so, and offers to clear the
 * filters; it used to leave a blank pane.
 */
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router"
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"
import type { RequestEntry } from "@/store"
import { useStudioStore } from "@/store"
import { TimelineView } from "@/views/timeline"
import { validateTimelineSearch } from "@/views/timeline/search-schema"

const REQUEST: RequestEntry = {
  id: "r1",
  source: "api",
  group: "users",
  method: "create",
  variables: undefined,
  mode: "direct",
  status: "success",
  middlewareCount: 0,
  middlewareEntries: [],
  hasValidation: { variables: false, response: false },
  startedAt: 1,
  sessionId: "s",
}

async function openTimeline(url: string) {
  const root = createRootRoute({
    component: () => (
      <TooltipProvider>
        <Outlet />
      </TooltipProvider>
    ),
  })
  const timeline = createRoute({
    getParentRoute: () => root,
    path: "/timeline",
    component: TimelineView,
    validateSearch: validateTimelineSearch,
  })
  const router = createRouter({
    routeTree: root.addChildren([timeline]),
    history: createMemoryHistory({ initialEntries: [url] }),
  })
  await act(() => router.load())
  render(<RouterProvider router={router} />)
  return router
}

beforeEach(() => {
  useStudioStore.setState({ requests: [REQUEST] })
})

afterEach(cleanup)

describe("a Timeline search that matches nothing", () => {
  it("says no request matches", async () => {
    await openTimeline("/timeline?search=nothing-like-it")

    expect(await screen.findByText("No requests match")).toBeTruthy()
  })

  it("clears the filters when asked", async () => {
    const router = await openTimeline("/timeline?search=nothing-like-it")

    await act(async () => (await screen.findByRole("button", { name: "Clear filters" })).click())

    expect(router.state.location.search).not.toHaveProperty("search")
  })
})
