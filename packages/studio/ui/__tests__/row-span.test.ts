/**
 * The rows of a long list a pane's view shows: those in view and twenty
 * past either edge, never past the list's own ends, and none of a list
 * wholly out of view.
 */
import { describe, expect, it } from "vitest";

import { rowSpanOf } from "@/lib/row-span";

describe("the rows a pane's view shows", () => {
  it("covers the view and twenty rows past either edge", () => {
    const span = rowSpanOf({ offset: 2_500, height: 600 }, 25, 12_000);

    expect(span).toEqual({ first: 80, last: 144 });
  });

  it("starts at the first row while the view is over the list's top", () => {
    expect(rowSpanOf({ offset: 0, height: 600 }, 25, 12_000)).toEqual({ first: 0, last: 44 });
    expect(rowSpanOf({ offset: -300, height: 600 }, 25, 12_000)).toEqual({ first: 0, last: 32 });
  });

  it("ends at the last row while the view is over the list's end", () => {
    const span = rowSpanOf({ offset: 299_700, height: 600 }, 25, 12_000);

    expect(span).toEqual({ first: 11_968, last: 11_999 });
  });

  it("holds no row of a list wholly above or below the view", () => {
    const above = rowSpanOf({ offset: 400_000, height: 600 }, 25, 12_000);
    const below = rowSpanOf({ offset: -5_000, height: 600 }, 25, 12_000);

    expect(above.last).toBeLessThan(above.first);
    expect(below.last).toBeLessThan(below.first);
  });

  it("holds no row of an empty list, or of rows not yet measured", () => {
    expect(rowSpanOf({ offset: 0, height: 600 }, 25, 0)).toEqual({ first: 0, last: -1 });
    expect(rowSpanOf({ offset: 0, height: 600 }, 0, 100)).toEqual({ first: 0, last: -1 });
  });

  it("follows rows of a height that is not whole pixels", () => {
    const span = rowSpanOf({ offset: 20_410, height: 408 }, 20.4, 12_002);

    expect(span).toEqual({ first: 980, last: 1_041 });
  });
});
