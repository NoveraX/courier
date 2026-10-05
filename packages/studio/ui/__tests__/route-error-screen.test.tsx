/**
 * @vitest-environment jsdom
 *
 * A view that throws while rendering is caught by the router, which shows
 * what failed and renders the view again on request, rather than the whole
 * page going down to a blank screen.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RouteErrorScreen } from "@/screens/route-error-screen";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("a view that failed", () => {
  it("shows what failed and renders the view again on request", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const reset = vi.fn();

    render(<RouteErrorScreen error={new Error("timeline broke")} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByRole("alert").textContent).toContain("This view failed");
    expect(screen.getByText("timeline broke")).toBeTruthy();
    expect(reset).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith("A Studio view failed", expect.any(Error));
  });
});
