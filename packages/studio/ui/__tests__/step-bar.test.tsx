/**
 * @vitest-environment jsdom
 *
 * A dialog's steps: a bar each, a step done that can be gone back to a
 * button named by its label — a phone shows the bars alone, with a line
 * under them naming the step in hand, or that every step is done.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StepBar } from "@/design/step-bar";

const STEPS = [
  { key: "source", label: "Sources" },
  { key: "configure", label: "Configure" },
  { key: "review", label: "Review" },
] as const;

afterEach(cleanup);

describe("StepBar", () => {
  it("names the step in hand, and its place among them, on a line for a phone", () => {
    render(<StepBar steps={STEPS} current={1} canGoBack={() => true} onBack={() => {}} />);

    expect(screen.getByText("Step 2 of 3 · Configure")).toBeTruthy();
    expect(screen.getByRole("button", { name: "02Configure" }).getAttribute("aria-current")).toBe(
      "step",
    );
  });

  it("says every step is done once the last is past", () => {
    render(<StepBar steps={STEPS} current={3} canGoBack={() => false} onBack={() => {}} />);

    expect(screen.getByText("All 3 steps done")).toBeTruthy();
  });

  it("goes back to a step done that allows it, and to no other", () => {
    const onBack = vi.fn();
    render(
      <StepBar steps={STEPS} current={2} canGoBack={(key) => key === "source"} onBack={onBack} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "02Configure" }));
    fireEvent.click(screen.getByRole("button", { name: "01Sources" }));

    expect(onBack).toHaveBeenCalledOnce();
    expect(onBack).toHaveBeenCalledWith("source");
  });
});
