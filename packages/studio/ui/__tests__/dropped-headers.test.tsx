/**
 * @vitest-environment jsdom
 */
/**
 * The headers a proxy call sent but the server did not forward. They come
 * back as JSON, and a value that was not text reached the page as a React
 * child, which took the whole detail panel down.
 */
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { DroppedHeadersSection } from "@/components/shared/headers-section"
import { TooltipProvider } from "@/components/ui/tooltip"

afterEach(cleanup)

describe("the headers a proxy did not forward", () => {
  it("lists those sent as text, and leaves out any other value", () => {
    const sent = JSON.stringify({ "x-trace": "abc", "x-shape": { depth: 1 }, accept: "*/*" })

    render(
      <TooltipProvider>
        <DroppedHeadersSection sent={sent} forwarded={{ Accept: "*/*" }} />
      </TooltipProvider>,
    )

    expect(screen.getByText("x-trace")).toBeTruthy()
    expect(screen.queryByText("x-shape")).toBeNull()
    expect(screen.queryByText("accept")).toBeNull()
  })
})
