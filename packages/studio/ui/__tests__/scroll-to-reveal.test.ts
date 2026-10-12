/**
 * Where a row of tabs that scrolls sideways scrolls to for a tab to show
 * whole: nowhere while it shows, otherwise the least move, with room for
 * its neighbour to peek in.
 */
import { describe, expect, it } from "vitest";

import { scrollToReveal } from "@/inspector/scroll-to-reveal";

const VIEW = { start: 100, size: 300 };

describe("scrollToReveal", () => {
  it("stays where it is while the item and its margin show", () => {
    expect(scrollToReveal(VIEW, { start: 140, size: 80 }, 24)).toBe(100);
  });

  it("scrolls back just far enough to show an item cut at the start", () => {
    expect(scrollToReveal(VIEW, { start: 90, size: 80 }, 24)).toBe(66);
  });

  it("scrolls on just far enough to show an item cut at the end", () => {
    expect(scrollToReveal(VIEW, { start: 380, size: 60 }, 24)).toBe(164);
  });

  it("never scrolls before the row's start", () => {
    expect(scrollToReveal(VIEW, { start: 10, size: 60 }, 24)).toBe(0);
  });

  it("shows the start of an item wider than the row", () => {
    expect(scrollToReveal({ start: 0, size: 100 }, { start: 200, size: 400 }, 0)).toBe(200);
    expect(scrollToReveal({ start: 700, size: 100 }, { start: 200, size: 400 }, 0)).toBe(200);
  });
});
