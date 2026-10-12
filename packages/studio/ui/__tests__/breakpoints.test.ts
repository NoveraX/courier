/**
 * How a list lays out its rows at a width: two lines each on a phone, its
 * narrow or wide columns otherwise, and the desktop layout until it is
 * measured.
 */
import { describe, expect, it } from "vitest";

import { listTierOf, STACKED_BELOW } from "@/design/breakpoints";

describe("listTierOf", () => {
  it("stacks the rows of a list narrower than a phone's width allows for columns", () => {
    expect(listTierOf(320, 760)).toBe("stacked");
    expect(listTierOf(STACKED_BELOW - 1, 760)).toBe("stacked");
  });

  it("shows the narrow columns from the stacking width to the wide one, and the wide ones from there", () => {
    expect(listTierOf(STACKED_BELOW, 760)).toBe("narrow");
    expect(listTierOf(759, 760)).toBe("narrow");
    expect(listTierOf(760, 760)).toBe("wide");
  });

  it("never stacks a list that is not measured yet, keeping its desktop layout", () => {
    expect(listTierOf(0, 760)).toBe("narrow");
    expect(listTierOf(0, 0)).toBe("wide");
  });
});
