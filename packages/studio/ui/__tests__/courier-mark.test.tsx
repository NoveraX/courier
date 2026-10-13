/**
 * @vitest-environment jsdom
 *
 * Courier's own code is marked with the Courier mark wherever it is offered
 * beside other kinds — the Copy as menu, a request's snippets — not with
 * the paper plane that sends a call in the Playground.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CourierMark } from "@/design/courier-mark";
import { CopyAsMenu } from "@/screens/playground/copy-as-menu";

afterEach(cleanup);

const MARK_PATH = "M212 0H90a90 90 0 0 0 0 180h122l-52-50H90a40 40 0 0 1 0-80h70Z";

describe("the Courier mark", () => {
  it("is the logo's path in the text colour, sized as an icon is", () => {
    const { container } = render(<CourierMark className="size-3" />);
    const svg = container.querySelector("svg");

    expect(svg?.getAttribute("class")).toBe("size-3");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.querySelector("path")?.getAttribute("d")).toBe(MARK_PATH);
    expect(svg?.querySelector("path")?.getAttribute("fill")).toBe("currentColor");
  });

  it("marks the Courier choice of the Copy as menu", () => {
    render(<CopyAsMenu transport="http" onCopy={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: /Copy as/ });
    fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });

    const courier = screen
      .getAllByRole("menuitem")
      .find((item) => item.querySelector(`path[d="${MARK_PATH}"]`) !== null);
    expect(courier?.textContent).toMatch(/courier/i);
  });
});
