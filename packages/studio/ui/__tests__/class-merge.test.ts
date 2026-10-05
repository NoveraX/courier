/**
 * Merging class names with the type scale's own utilities: a `text-meta` or
 * `text-control` sets the font size, so it replaces `text-xs` and leaves the
 * text colour it is combined with in place; the design's `font-strong` is a
 * weight, so it stays beside `font-mono`.
 */
import { describe, expect, it } from "vitest";

import { cn } from "../src/lib/utils";

describe("cn", () => {
  it("keeps a status colour next to a type-scale size", () => {
    const merged = cn("text-xs font-medium text-err", "text-meta").split(" ");

    expect(merged).toContain("text-err");
    expect(merged).toContain("text-meta");
    expect(merged).not.toContain("text-xs");
  });

  it("lets the later of two sizes win", () => {
    expect(cn("text-small", "text-xs")).toBe("text-xs");
  });

  it("keeps a design colour next to a design size, and a weight next to a family", () => {
    const merged = cn("text-control text-fg-muted", "font-mono font-strong").split(" ");

    expect(merged).toEqual(["text-control", "text-fg-muted", "font-mono", "font-strong"]);
  });

  it("lets the later of two design sizes win", () => {
    expect(cn("text-control", "text-meta")).toBe("text-meta");
  });
});
