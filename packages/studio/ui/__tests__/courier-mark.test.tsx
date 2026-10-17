/**
 * @vitest-environment jsdom
 *
 * Courier's own code is marked with the Courier mark wherever it is offered
 * beside other kinds — the Copy as menu, a request's snippets — not with
 * the paper plane that sends a call in the Playground.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CourierLogo } from "@/design/courier-logo";
import { COURIER_MARK_BOUNDS, CourierMark } from "@/design/courier-mark";
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

  it("keeps a lucide glyph's share of clear room around it, centred", () => {
    const { container } = render(<CourierMark className="size-3" />);
    const box = container.querySelector("svg")?.getAttribute("viewBox")?.split(" ").map(Number);

    expect(box).toEqual([-21, -37, 254, 254]);
    const [x, y, w, h] = box ?? [];
    // The mark spans 212 by 180; equal margins on opposite sides.
    expect(-(x ?? 0) * 2 + 212).toBe(w);
    expect(-(y ?? 0) * 2 + 180).toBe(h);
    // 20 of 24 units across, between Terminal's 18 and Code's 22.
    expect((212 / (w ?? 1)) * 24).toBeCloseTo(20, 0);
  });

  it("is not padded when it is the logo's", () => {
    const { container } = render(<CourierLogo product="Studio" />);
    const svg = container.querySelector("svg");

    expect(svg?.getAttribute("viewBox")).toBe(COURIER_MARK_BOUNDS);
    expect(COURIER_MARK_BOUNDS).toBe("0 0 212 180");
    expect(svg?.getAttribute("class")).toBe("block w-7 shrink-0");
    expect(svg?.querySelector("path")?.getAttribute("d")).toBe(MARK_PATH);
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
