/**
 * How the Waterfall lays out a row on a narrow chart: the column of labels
 * gives way below a phone's width, each label then running as wide as the
 * chart shows over its bar, and a finger's tap calling up no tooltip.
 */
import { describe, expect, it, vi } from "vitest";

import { mouseOnly } from "@/screens/waterfall/mouse-only";
import { labelWidthIn, labelWidthOf, TRACK_LAYOUT } from "@/screens/waterfall/track-layout";

describe("labelWidthOf", () => {
  it("gives the column of labels a third of a wide chart, between 240 and 320 pixels", () => {
    expect(labelWidthOf(1180)).toBe(320);
    expect(labelWidthOf(800)).toBe(256);
    expect(labelWidthOf(600)).toBe(240);
  });

  it("drops the column on a chart narrower than a phone allows for one", () => {
    expect(labelWidthOf(559)).toBe(0);
    expect(labelWidthOf(375)).toBe(0);
  });

  it("keeps the column on a chart not measured yet", () => {
    expect(labelWidthOf(0)).toBe(240);
  });
});

describe("labelWidthIn", () => {
  it("gives a label beside its bar the column's width", () => {
    expect(labelWidthIn(false, 320, 1180, 4000)).toBe(320);
  });

  it("runs a label over its bar as wide as the chart shows, or the track when that is shorter", () => {
    expect(labelWidthIn(true, 0, 375, 3000)).toBe(375);
    expect(labelWidthIn(true, 0, 375, 300)).toBe(300);
  });
});

describe("TRACK_LAYOUT", () => {
  it("makes a stacked row tall enough for a finger whatever the pointer, and a row on one line only under a finger", () => {
    expect(TRACK_LAYOUT.stacked.row).toContain("h-11");
    expect(TRACK_LAYOUT.columns.row).toBe("h-8 pointer-coarse:h-11");
  });
});

describe("mouseOnly", () => {
  const event = (pointerType: string) => ({ pointerType }) as React.PointerEvent<Element>;

  it("passes a mouse's pointer events on", () => {
    const handler = vi.fn();

    mouseOnly(handler)(event("mouse"));

    expect(handler).toHaveBeenCalledOnce();
  });

  it("ignores a finger's and a pen's, which leave no pointer to move off a tooltip", () => {
    const handler = vi.fn();

    mouseOnly(handler)(event("touch"));
    mouseOnly(handler)(event("pen"));

    expect(handler).not.toHaveBeenCalled();
  });
});
