/**
 * A counter animating down to 0 passes values just below it; rounded, those
 * gave -0, which the Mocks view printed as "Records -0".
 */
import { describe, expect, it } from "vitest";

import { displayedCount } from "../src/lib/displayed-count";

describe("displayedCount", () => {
  it("shows a value just below zero as 0, not -0", () => {
    expect(Object.is(displayedCount(-0.3), 0)).toBe(true);
    expect((displayedCount(-0.3)).toLocaleString()).toBe("0");
  });

  it("rounds a value on its way to a count", () => {
    expect(displayedCount(19.6)).toBe(20);
    expect(displayedCount(2.4)).toBe(2);
  });
});
