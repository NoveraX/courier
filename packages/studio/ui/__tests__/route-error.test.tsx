/**
 * @vitest-environment jsdom
 *
 * A view that threw while rendering took the whole page down to a blank
 * screen: Studio had no error boundary.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RouteError } from "../src/components/shared/route-error";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("RouteError", () => {
  it("shows what failed and renders the view again on request", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const reset = vi.fn();

    render(<RouteError error={new Error("timeline broke")} reset={reset} info={undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByText("This view failed")).toBeTruthy();
    expect(screen.getByText("timeline broke")).toBeTruthy();
    expect(reset).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith("A Studio view failed", expect.any(Error));
  });
});
